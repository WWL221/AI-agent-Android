package com.pocketagent.mobile;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "FileAccess")
public class FileAccess extends Plugin {
  @PluginMethod
  public void isAllFilesAccess(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("granted", isGranted());
    ret.put("supported", Build.VERSION.SDK_INT >= 30);
    call.resolve(ret);
  }

  @PluginMethod
  public void openSettings(PluginCall call) {
    try {
      Intent intent;
      if (Build.VERSION.SDK_INT >= 30) {
        intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
      } else {
        intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
      }
      getActivity().startActivity(intent);
      call.resolve();
    } catch (Exception ex) {
      call.reject(ex.getMessage() == null ? "open settings failed" : ex.getMessage());
    }
  }

  @PluginMethod
  public void list(PluginCall call) {
    String path = call.getString("path", "/storage/emulated/0");
    File dir = new File(path);
    File[] files = dir.listFiles();
    JSArray entries = new JSArray();
    if (files != null) {
      for (File file : files) {
        JSObject entry = new JSObject();
        entry.put("name", file.getName());
        entry.put("path", file.getAbsolutePath());
        entry.put("isDirectory", file.isDirectory());
        entry.put("size", file.isFile() ? file.length() : 0);
        entries.put(entry);
      }
    }
    JSObject ret = new JSObject();
    ret.put("entries", entries);
    call.resolve(ret);
  }

  @PluginMethod
  public void read(PluginCall call) {
    String path = call.getString("path", "");
    if (path.isEmpty()) {
      call.reject("path is required");
      return;
    }
    File file = new File(path);
    if (!file.exists() || file.isDirectory()) {
      call.reject("file not found");
      return;
    }
    try {
      byte[] bytes = readBytes(file);
      String content = new String(bytes, StandardCharsets.UTF_8);
      JSObject ret = new JSObject();
      ret.put("content", content);
      ret.put("size", file.length());
      call.resolve(ret);
    } catch (Exception ex) {
      call.reject(ex.getMessage() == null ? "read file failed" : ex.getMessage());
    }
  }

  @PluginMethod
  public void saveImage(PluginCall call) {
    String path = call.getString("path", "");
    String base64 = call.getString("base64", "");
    if (path.isEmpty() || base64.isEmpty()) {
      call.reject("path and base64 are required");
      return;
    }
    try {
      File root = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
      File file = new File(root, path);
      if (!file.getParentFile().exists()) {
        file.getParentFile().mkdirs();
      }
      byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
      try (FileOutputStream output = new FileOutputStream(file)) {
        output.write(bytes);
      }
      JSObject ret = new JSObject();
      ret.put("path", file.getAbsolutePath());
      ret.put("size", bytes.length);
      call.resolve(ret);
    } catch (Exception ex) {
      call.reject(ex.getMessage() == null ? "save image failed" : ex.getMessage());
    }
  }

  private boolean isGranted() {
    if (Build.VERSION.SDK_INT >= 30) {
      return Environment.isExternalStorageManager();
    }
    return getContext().checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE)
        == PackageManager.PERMISSION_GRANTED;
  }

  private byte[] readBytes(File file) throws Exception {
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    try (InputStream input = new FileInputStream(file)) {
      byte[] chunk = new byte[8192];
      int count;
      while ((count = input.read(chunk)) != -1) {
        buffer.write(chunk, 0, count);
      }
    }
    return buffer.toByteArray();
  }
}
