package sk.virivky.tlacetikiet;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothStatusCodes;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Most medzi webovou časťou aplikácie (JavaScript) a Bluetooth LE v Androide.
 * JS volá metódy objektu window.TlacNative, udalosti dostáva cez window.__tlacNative(udalosť).
 */
public class BleBridge {
    static final int REQ_BLE = 21;
    static final int REQ_ENABLE_BT = 22;

    private static UUID u16(int v) {
        return UUID.fromString(String.format("%08x-0000-1000-8000-00805f9b34fb", v));
    }

    /** Známe dvojice služba → charakteristika na zápis (prvá je SK58 / Sinmark). */
    private static final UUID[][] KNOWN = {
        {u16(0x18f0), u16(0x2af1)},
        {u16(0xff00), u16(0xff02)},
        {u16(0xffe0), u16(0xffe1)},
        {u16(0xae30), u16(0xae01)},
        {UUID.fromString("49535343-fe7d-4ae5-8fa9-9fafd205e455"), UUID.fromString("49535343-8841-43f4-a8d4-ecbe34729bb3")},
        {UUID.fromString("e7810a71-73ae-499d-8c15-faa9aef0c3f2"), UUID.fromString("bef8d6c9-9c21-4c9e-b632-bd58c1009f9f")},
        {u16(0xfff0), u16(0xfff2)},
        {u16(0xffe5), u16(0xffe9)},
        {UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e"), UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e")},
    };

    private final Activity act;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService writer = Executors.newSingleThreadExecutor();
    private final BluetoothAdapter adapter;

    private BluetoothLeScanner scanner;
    private ScanCallback scanCb;
    private final Map<String, String> seen = new HashMap<>();

    private volatile BluetoothGatt gatt;
    private volatile BluetoothGattCharacteristic writeChar;
    private String connectingAddress;
    private int connectAttempt;
    private boolean ready;

    private final Object writeLock = new Object();
    private boolean writeAck;
    private volatile boolean cancel;

    private Runnable afterPermission;
    private Runnable afterEnable;

    private final Runnable stopScanLater = this::stopScanInternal;
    private final Runnable connectTimeout = () -> {
        if (!ready && connectingAddress != null) {
            String a = connectingAddress;
            closeGatt();
            if (connectAttempt < 1) {
                doConnect(a, connectAttempt + 1);
            } else {
                connectingAddress = null;
                emitMsg("connectError", "Tlačiareň neodpovedá. Je zapnutá, blízko a nie je pripojená v inej aplikácii (Sinmark)?");
            }
        }
    };

    BleBridge(Activity a, WebView w) {
        act = a;
        web = w;
        BluetoothManager m = (BluetoothManager) a.getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = m != null ? m.getAdapter() : null;
    }

    // ------------------------------------------------------------------ udalosti do JS
    private void emit(JSONObject o) {
        final String js = "window.__tlacNative&&window.__tlacNative(" + o + ")";
        main.post(() -> web.evaluateJavascript(js, null));
    }

    private JSONObject ev(String type) {
        JSONObject o = new JSONObject();
        try { o.put("type", type); } catch (JSONException ignored) { }
        return o;
    }

    private void emitMsg(String type, String message) {
        JSONObject o = ev(type);
        try { o.put("message", message); } catch (JSONException ignored) { }
        emit(o);
    }

    // ------------------------------------------------------------------ povolenia
    private String[] neededPerms(boolean scan) {
        if (Build.VERSION.SDK_INT >= 31) {
            return scan ? new String[]{Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}
                        : new String[]{Manifest.permission.BLUETOOTH_CONNECT};
        }
        return scan ? new String[]{Manifest.permission.ACCESS_FINE_LOCATION} : new String[0];
    }

    private boolean hasPerms(String[] perms) {
        for (String p : perms) {
            if (act.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    private void withPermissions(boolean scan, Runnable r) {
        String[] p = neededPerms(scan);
        if (hasPerms(p)) { r.run(); return; }
        afterPermission = r;
        act.requestPermissions(p, REQ_BLE);
    }

    void onPermissionsResult(int code, int[] results) {
        if (code != REQ_BLE) return;
        boolean ok = results.length > 0;
        for (int r : results) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
        Runnable r = afterPermission;
        afterPermission = null;
        if (ok && r != null) r.run();
        else if (!ok) emitMsg("error", "Aplikácia nemá povolenie na Bluetooth. Povoľte „Zariadenia v blízkosti“: Nastavenia → Aplikácie → Tlač etikiet → Povolenia.");
    }

    private void withBluetoothOn(Runnable r) {
        if (adapter == null) { emitMsg("error", "Tento telefón nemá Bluetooth."); return; }
        if (adapter.isEnabled()) { r.run(); return; }
        afterEnable = r;
        try {
            act.startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQ_ENABLE_BT);
        } catch (Exception e) {
            afterEnable = null;
            emitMsg("error", "Zapnite Bluetooth v telefóne a skúste znova.");
        }
    }

    void onActivityResult(int code, int result) {
        if (code != REQ_ENABLE_BT) return;
        Runnable r = afterEnable;
        afterEnable = null;
        if (result == Activity.RESULT_OK && r != null) r.run();
        else emitMsg("error", "Bluetooth je vypnutý. Zapnite ho a skúste znova.");
    }

    // ------------------------------------------------------------------ informácie
    @JavascriptInterface
    public String info() {
        JSONObject o = new JSONObject();
        try {
            o.put("native", true);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("android", Build.VERSION.RELEASE);
            o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
            o.put("bluetooth", adapter != null);
            o.put("enabled", adapter != null && adapter.isEnabled());
            o.put("permissions", hasPerms(neededPerms(true)));
            o.put("connected", ready);
            o.put("version", BuildConfig.VERSION_NAME);
        } catch (JSONException ignored) { }
        return o.toString();
    }

    // ------------------------------------------------------------------ hľadanie
    @JavascriptInterface
    public void startScan() {
        main.post(() -> withPermissions(true, () -> withBluetoothOn(this::doScan)));
    }

    @JavascriptInterface
    public void stopScan() {
        main.post(this::stopScanInternal);
    }

    private void doScan() {
        stopScanInternal();
        seen.clear();
        if (Build.VERSION.SDK_INT <= 30) {
            LocationManager lm = (LocationManager) act.getSystemService(Context.LOCATION_SERVICE);
            boolean on = true;
            if (lm != null) {
                on = Build.VERSION.SDK_INT >= 28 ? lm.isLocationEnabled()
                    : (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
            }
            if (!on) emitMsg("hint", "Zapnite v telefóne Polohu – bez nej Android nenájde Bluetooth zariadenia.");
        }
        try {
            for (BluetoothDevice d : adapter.getBondedDevices()) report(d, 0, true, null);
        } catch (SecurityException ignored) { }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) { emitMsg("scanError", "Bluetooth sa nepodarilo spustiť. Vypnite a zapnite Bluetooth."); return; }
        scanCb = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult r) {
                String adv = r.getScanRecord() != null ? r.getScanRecord().getDeviceName() : null;
                main.post(() -> report(r.getDevice(), r.getRssi(), false, adv));
            }

            @Override
            public void onBatchScanResults(List<ScanResult> results) {
                for (ScanResult r : results) onScanResult(0, r);
            }

            @Override
            public void onScanFailed(int errorCode) {
                emitMsg("scanError", "Hľadanie zlyhalo (kód " + errorCode + "). Vypnite a zapnite Bluetooth a skúste znova.");
            }
        };
        ScanSettings st = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build();
        try {
            scanner.startScan(null, st, scanCb);
            emit(ev("scanStarted"));
            main.postDelayed(stopScanLater, 25000);
        } catch (SecurityException e) {
            emitMsg("scanError", "Chýba povolenie na hľadanie Bluetooth zariadení.");
        }
    }

    private void report(BluetoothDevice d, int rssi, boolean bonded, String advName) {
        String name = null;
        try { name = d.getName(); } catch (SecurityException ignored) { }
        if (name == null || name.isEmpty()) name = advName;
        if (name == null) name = "";
        String addr = d.getAddress();
        String prev = seen.get(addr);
        if (prev != null && prev.equals(name) && !bonded) {
            // len aktualizácia sily signálu – posielať zriedka
            return;
        }
        seen.put(addr, name);
        JSONObject o = ev("device");
        try {
            o.put("id", addr);
            o.put("name", name);
            o.put("rssi", rssi);
            o.put("bonded", bonded);
        } catch (JSONException ignored) { }
        emit(o);
    }

    private void stopScanInternal() {
        main.removeCallbacks(stopScanLater);
        if (scanner != null && scanCb != null) {
            try { scanner.stopScan(scanCb); } catch (Exception ignored) { }
            emit(ev("scanStopped"));
        }
        scanCb = null;
    }

    // ------------------------------------------------------------------ pripojenie
    @JavascriptInterface
    public void connect(final String address) {
        main.post(() -> withPermissions(false, () -> withBluetoothOn(() -> doConnect(address, 0))));
    }

    private void doConnect(String address, int attempt) {
        stopScanInternal();
        closeGatt();
        BluetoothDevice dev;
        try {
            dev = adapter.getRemoteDevice(address);
        } catch (IllegalArgumentException e) {
            emitMsg("connectError", "Neplatná adresa zariadenia.");
            return;
        }
        connectingAddress = address;
        connectAttempt = attempt;
        ready = false;
        emit(ev("connecting"));
        try {
            gatt = dev.connectGatt(act, false, gattCb, BluetoothDevice.TRANSPORT_LE);
        } catch (SecurityException e) {
            connectingAddress = null;
            emitMsg("connectError", "Chýba povolenie na pripojenie Bluetooth zariadenia.");
            return;
        }
        main.removeCallbacks(connectTimeout);
        main.postDelayed(connectTimeout, 12000);
    }

    private final BluetoothGattCallback gattCb = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            main.post(() -> {
                if (g != gatt) { try { g.close(); } catch (Exception ignored) { } return; }
                if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                    try {
                        g.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH);
                        if (!g.discoverServices()) throw new IllegalStateException();
                    } catch (Exception e) {
                        failConnect("Nepodarilo sa načítať služby tlačiarne.");
                    }
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) {
                    boolean wasReady = ready;
                    String addr = connectingAddress;
                    int attempt = connectAttempt;
                    closeGatt();
                    if (wasReady) {
                        emit(ev("disconnected"));
                    } else if (addr != null && attempt < 1) {
                        main.removeCallbacks(connectTimeout);
                        main.postDelayed(() -> doConnect(addr, attempt + 1), 600);
                    } else {
                        failConnect("Pripojenie zlyhalo (kód " + status + "). Vypnite a zapnite tlačiareň a skúste znova.");
                    }
                }
            });
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            main.post(() -> {
                if (g != gatt) return;
                BluetoothGattCharacteristic found = null;
                String inf = "";
                for (UUID[] k : KNOWN) {
                    BluetoothGattService s = g.getService(k[0]);
                    if (s == null) continue;
                    BluetoothGattCharacteristic c = s.getCharacteristic(k[1]);
                    if (c != null) { found = c; inf = "služba " + shortUuid(k[0]) + ", charakteristika " + shortUuid(k[1]); break; }
                }
                if (found == null) {
                    outer:
                    for (BluetoothGattService s : g.getServices()) {
                        for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                            int p = c.getProperties();
                            if ((p & (BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE | BluetoothGattCharacteristic.PROPERTY_WRITE)) != 0) {
                                found = c;
                                inf = "služba " + shortUuid(s.getUuid()) + ", charakteristika " + shortUuid(c.getUuid());
                                break outer;
                            }
                        }
                    }
                }
                main.removeCallbacks(connectTimeout);
                if (found == null) {
                    failConnect("V tomto zariadení sa nenašla charakteristika na zápis – je to naozaj tlačiareň?");
                    return;
                }
                writeChar = found;
                ready = true;
                String name = "";
                try { name = g.getDevice().getName(); } catch (SecurityException ignored) { }
                JSONObject o = ev("connected");
                try {
                    o.put("id", g.getDevice().getAddress());
                    o.put("name", name == null ? "" : name);
                    o.put("info", inf);
                } catch (JSONException ignored) { }
                connectingAddress = null;
                emit(o);
            });
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            synchronized (writeLock) {
                writeAck = true;
                writeLock.notifyAll();
            }
        }
    };

    private void failConnect(String msg) {
        main.removeCallbacks(connectTimeout);
        connectingAddress = null;
        closeGatt();
        emitMsg("connectError", msg);
    }

    private static String shortUuid(UUID u) {
        String s = u.toString();
        if (s.endsWith("-0000-1000-8000-00805f9b34fb") && s.startsWith("0000")) return "0x" + s.substring(4, 8).toUpperCase();
        return s;
    }

    private void closeGatt() {
        ready = false;
        writeChar = null;
        BluetoothGatt g = gatt;
        gatt = null;
        if (g != null) {
            try { g.disconnect(); } catch (Exception ignored) { }
            try { g.close(); } catch (Exception ignored) { }
        }
    }

    @JavascriptInterface
    public void disconnect() {
        main.post(() -> {
            main.removeCallbacks(connectTimeout);
            connectingAddress = null;
            boolean was = gatt != null;
            closeGatt();
            if (was) emit(ev("disconnected"));
        });
    }

    // ------------------------------------------------------------------ zápis
    @JavascriptInterface
    public void write(String b64, int chunk, int delayMs, String id) {
        final byte[] data;
        try {
            data = Base64.decode(b64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            writeError(id, "Neplatné údaje pre tlačiareň.");
            return;
        }
        cancel = false;
        final int size = Math.max(10, Math.min(512, chunk));
        final int delay = Math.max(0, Math.min(500, delayMs));
        writer.execute(() -> doWrite(data, size, delay, id));
    }

    @JavascriptInterface
    public void cancelWrite() {
        cancel = true;
    }

    private void writeError(String id, String msg) {
        JSONObject o = ev("writeError");
        try { o.put("id", id); o.put("message", msg); } catch (JSONException ignored) { }
        emit(o);
    }

    @SuppressWarnings("deprecation")
    private void doWrite(byte[] data, int chunk, int delay, String id) {
        BluetoothGatt g = gatt;
        BluetoothGattCharacteristic c = writeChar;
        if (g == null || c == null) { writeError(id, "Tlačiareň nie je pripojená."); return; }
        boolean noResp = (c.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
        int type = noResp ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;
        long lastProgress = 0;
        for (int off = 0; off < data.length; off += chunk) {
            if (cancel) { writeError(id, "Tlač bola zrušená."); return; }
            if (gatt != g || writeChar == null) { writeError(id, "Spojenie s tlačiarňou sa prerušilo."); return; }
            byte[] part = Arrays.copyOfRange(data, off, Math.min(data.length, off + chunk));
            boolean ok = false;
            for (int attempt = 0; attempt < 100 && !ok; attempt++) {
                synchronized (writeLock) { writeAck = false; }
                try {
                    if (Build.VERSION.SDK_INT >= 33) {
                        ok = g.writeCharacteristic(c, part, type) == BluetoothStatusCodes.SUCCESS;
                    } else {
                        c.setWriteType(type);
                        c.setValue(part);
                        ok = g.writeCharacteristic(c);
                    }
                } catch (SecurityException e) {
                    writeError(id, "Chýba povolenie na Bluetooth.");
                    return;
                }
                if (!ok) sleep(10);
            }
            if (!ok) { writeError(id, "Zápis do tlačiarne zlyhal. Skúste vypnúť a zapnúť tlačiareň."); return; }
            synchronized (writeLock) {
                long t0 = System.currentTimeMillis();
                while (!writeAck && System.currentTimeMillis() - t0 < 400) {
                    try { writeLock.wait(50); } catch (InterruptedException e) { return; }
                }
            }
            if (delay > 0) sleep(delay);
            long now = System.currentTimeMillis();
            int sent = Math.min(data.length, off + chunk);
            if (now - lastProgress > 120 || sent >= data.length) {
                lastProgress = now;
                JSONObject o = ev("progress");
                try { o.put("id", id); o.put("sent", sent); o.put("total", data.length); } catch (JSONException ignored) { }
                emit(o);
            }
        }
        JSONObject o = ev("writeDone");
        try { o.put("id", id); } catch (JSONException ignored) { }
        emit(o);
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) { }
    }

    // ------------------------------------------------------------------ súbory (záloha, obrázky)
    /** Uloží súbor do priečinka Stiahnuté; pri share=true ho rovno ponúkne na zdieľanie. */
    @JavascriptInterface
    public String saveFile(String name, String mime, String b64, boolean share) {
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            Uri uri;
            String where;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                uri = act.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new IllegalStateException("insert");
                try (OutputStream os = act.getContentResolver().openOutputStream(uri)) {
                    if (os == null) throw new IllegalStateException("stream");
                    os.write(bytes);
                }
                where = "Stiahnuté/" + name;
            } else {
                File dir = act.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = act.getFilesDir();
                File f = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                uri = null;
                where = f.getAbsolutePath();
            }
            if (share && uri != null) {
                final Uri u = uri;
                main.post(() -> {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM, u);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try { act.startActivity(Intent.createChooser(send, "Zdieľať")); } catch (Exception ignored) { }
                });
            }
            return "Uložené: " + where;
        } catch (Exception e) {
            return "Súbor sa nepodarilo uložiť.";
        }
    }

    void close() {
        stopScanInternal();
        closeGatt();
        writer.shutdownNow();
    }
}
