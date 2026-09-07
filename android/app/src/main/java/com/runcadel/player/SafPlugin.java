package com.runcadel.player;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "SafStorage")
public class SafPlugin extends Plugin {
    private static final String TAG = "SafStoragePlugin";
    private static final String PREFS_NAME = "runcadel_saf_prefs";
    private static final String KEY_PERSISTED_URI = "persisted_tree_uri";

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private void savePersistedUri(String uriString) {
        getPrefs().edit().putString(KEY_PERSISTED_URI, uriString).apply();
    }

    private String getSavedPersistedUri() {
        return getPrefs().getString(KEY_PERSISTED_URI, null);
    }

    private void clearSavedPersistedUri() {
        getPrefs().edit().remove(KEY_PERSISTED_URI).apply();
    }

    private boolean hasPersistedPermission(Uri uri) {
        if (uri == null) return false;
        List<UriPermission> permissions = getContext().getContentResolver().getPersistedUriPermissions();
        for (UriPermission perm : permissions) {
            if (perm.getUri().equals(uri) && perm.isReadPermission()) {
                return true;
            }
        }
        return false;
    }

    @PluginMethod
    public void openFolderPicker(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            intent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
                Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
            );
            startActivityForResult(call, intent, "folderPickerResult");
        } catch (Exception e) {
            Log.e(TAG, "Error opening document tree picker", e);
            call.reject("Failed to launch folder picker: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void folderPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject res = new JSObject();
            res.put("cancelled", true);
            call.resolve(res);
            return;
        }

        try {
            Uri treeUri = result.getData().getData();
            int takeFlags = result.getData().getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (takeFlags == 0) {
                takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
            }
            getContext().getContentResolver().takePersistableUriPermission(treeUri, takeFlags);

            savePersistedUri(treeUri.toString());

            DocumentFile rootDir = DocumentFile.fromTreeUri(getContext(), treeUri);
            String folderName = rootDir != null ? rootDir.getName() : "Selected Folder";

            JSArray lectures = scanTreeDirectory(rootDir);

            JSObject res = new JSObject();
            res.put("success", true);
            res.put("uri", treeUri.toString());
            res.put("folderName", folderName);
            res.put("lectures", lectures);
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "Error processing selected document tree", e);
            call.reject("Error accessing selected folder: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getPersistedFolder(PluginCall call) {
        try {
            String savedUriStr = getSavedPersistedUri();
            if (savedUriStr == null) {
                JSObject res = new JSObject();
                res.put("hasPersisted", false);
                call.resolve(res);
                return;
            }

            Uri treeUri = Uri.parse(savedUriStr);
            if (!hasPersistedPermission(treeUri)) {
                clearSavedPersistedUri();
                JSObject res = new JSObject();
                res.put("hasPersisted", false);
                call.resolve(res);
                return;
            }

            DocumentFile rootDir = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (rootDir == null || !rootDir.exists()) {
                clearSavedPersistedUri();
                JSObject res = new JSObject();
                res.put("hasPersisted", false);
                call.resolve(res);
                return;
            }

            JSArray lectures = scanTreeDirectory(rootDir);
            JSObject res = new JSObject();
            res.put("hasPersisted", true);
            res.put("uri", savedUriStr);
            res.put("folderName", rootDir.getName());
            res.put("lectures", lectures);
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "Error getting persisted folder", e);
            JSObject res = new JSObject();
            res.put("hasPersisted", false);
            res.put("error", e.getMessage());
            call.resolve(res);
        }
    }

    @PluginMethod
    public void clearPersistedFolder(PluginCall call) {
        try {
            String savedUriStr = getSavedPersistedUri();
            if (savedUriStr != null) {
                Uri treeUri = Uri.parse(savedUriStr);
                try {
                    getContext().getContentResolver().releasePersistableUriPermission(
                        treeUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
                } catch (Exception ignored) {}
            }
            clearSavedPersistedUri();
            JSObject res = new JSObject();
            res.put("success", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Failed to clear persisted folder: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readTextFile(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("Missing 'uri' parameter");
            return;
        }

        try {
            Uri fileUri = Uri.parse(uriStr);
            InputStream is = getContext().getContentResolver().openInputStream(fileUri);
            if (is == null) {
                call.reject("Could not open input stream for: " + uriStr);
                return;
            }

            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                char[] buf = new char[8192];
                int charsRead;
                while ((charsRead = reader.read(buf)) != -1) {
                    sb.append(buf, 0, charsRead);
                }
            }

            JSObject res = new JSObject();
            res.put("content", sb.toString());
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "Error reading text file: " + uriStr, e);
            call.reject("Error reading file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readBinaryFileBase64(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("Missing 'uri' parameter");
            return;
        }

        try {
            Uri fileUri = Uri.parse(uriStr);
            InputStream is = getContext().getContentResolver().openInputStream(fileUri);
            if (is == null) {
                call.reject("Could not open input stream for: " + uriStr);
                return;
            }

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] data = new byte[16384];
            int nRead;
            while ((nRead = is.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, nRead);
            }
            buffer.flush();
            is.close();

            byte[] bytes = buffer.toByteArray();
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

            JSObject res = new JSObject();
            res.put("data", base64);
            res.put("size", bytes.length);
            call.resolve(res);
        } catch (Exception e) {
            Log.e(TAG, "Error reading binary file: " + uriStr, e);
            call.reject("Error reading binary file: " + e.getMessage());
        }
    }

    /**
     * Traverses the DocumentFile tree to discover course lecture bundles
     */
    private JSArray scanTreeDirectory(DocumentFile rootDir) {
        JSArray list = new JSArray();
        if (rootDir == null || !rootDir.isDirectory()) return list;

        DocumentFile[] children = rootDir.listFiles();

        // 1. First check if the rootDir itself directly contains lecture files (single lecture folder)
        JSObject directLecture = inspectFolderForLecture(rootDir, rootDir.getName());
        if (directLecture != null) {
            list.put(directLecture);
            return list;
        }

        // 2. Otherwise iterate child directories (e.g. Lec_01_..., Lec_02_...)
        for (DocumentFile child : children) {
            if (child.isDirectory()) {
                JSObject lecture = inspectFolderForLecture(child, child.getName());
                if (lecture != null) {
                    list.put(lecture);
                } else {
                    // Check 1 level deeper in case of nested course folder structure
                    DocumentFile[] subChildren = child.listFiles();
                    for (DocumentFile subChild : subChildren) {
                        if (subChild.isDirectory()) {
                            JSObject subLecture = inspectFolderForLecture(subChild, subChild.getName());
                            if (subLecture != null) {
                                list.put(subLecture);
                            }
                        }
                    }
                }
            }
        }

        return list;
    }

    private JSObject inspectFolderForLecture(DocumentFile folder, String folderName) {
        if (folder == null || !folder.isDirectory()) return null;

        DocumentFile[] files = folder.listFiles();
        DocumentFile videoFile = null;
        DocumentFile jsonFile = null;
        DocumentFile pdfFile = null;

        for (DocumentFile file : files) {
            if (file.isFile()) {
                String name = file.getName();
                if (name == null) continue;
                String lower = name.toLowerCase();

                // Video detection
                if (lower.endsWith(".webm") || lower.endsWith(".mp4") || lower.endsWith(".mkv")) {
                    if (videoFile == null || lower.equals("output.webm")) {
                        videoFile = file;
                    }
                }
                // Telemetry vector JSON detection
                else if (lower.endsWith(".json")) {
                    if (jsonFile == null || lower.equals("data.json") || lower.equals("securejson.json")) {
                        jsonFile = file;
                    }
                }
                // Slide notes PDF
                else if (lower.endsWith(".pdf")) {
                    if (pdfFile == null) {
                        pdfFile = file;
                    }
                }
            }
        }

        // A valid lecture bundle must have at least telemetry JSON or a video file
        if (videoFile != null || jsonFile != null) {
            JSObject obj = new JSObject();
            obj.put("folderName", folderName);
            obj.put("folderUri", folder.getUri().toString());

            if (videoFile != null) {
                obj.put("videoName", videoFile.getName());
                obj.put("videoUri", videoFile.getUri().toString());
                obj.put("videoSize", videoFile.length());
            }

            if (jsonFile != null) {
                obj.put("telemetryName", jsonFile.getName());
                obj.put("telemetryUri", jsonFile.getUri().toString());
                obj.put("telemetrySize", jsonFile.length());
            }

            if (pdfFile != null) {
                obj.put("pdfName", pdfFile.getName());
                obj.put("pdfUri", pdfFile.getUri().toString());
                obj.put("pdfSize", pdfFile.length());
            }

            return obj;
        }

        return null;
    }
}
