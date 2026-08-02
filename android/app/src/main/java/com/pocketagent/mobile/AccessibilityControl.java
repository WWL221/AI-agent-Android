package com.pocketagent.mobile;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.accessibility.AccessibilityManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

@CapacitorPlugin(name = "AccessibilityControl")
public class AccessibilityControl extends Plugin {
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  @PluginMethod
  public void isEnabled(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("enabled", isServiceEnabled());
    call.resolve(ret);
  }

  @PluginMethod
  public void openSettings(PluginCall call) {
    try {
      Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
      call.resolve();
    } catch (Exception ex) {
      call.reject(ex.getMessage() == null ? "open settings failed" : ex.getMessage());
    }
  }

  @PluginMethod
  public void disable(PluginCall call) {
    mainHandler.post(() -> {
      AgentAccessibilityService service = AgentAccessibilityService.getInstance();
      if (service != null) {
        service.disableSelf();
      }
      JSObject ret = new JSObject();
      ret.put("ok", true);
      call.resolve(ret);
    });
  }

  @PluginMethod
  public void status(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("enabled", isServiceEnabled());
    AgentAccessibilityService service = AgentAccessibilityService.getInstance();
    ret.put("foregroundPackage", service == null ? "" : service.getForegroundPackage());
    call.resolve(ret);
  }

  @PluginMethod
  public void getUiTree(PluginCall call) {
    mainHandler.post(() -> {
      AgentAccessibilityService service = AgentAccessibilityService.getInstance();
      if (service == null) {
        call.reject("无障碍服务未连接");
        return;
      }
      call.resolve(service.getUiTree());
    });
  }

  @PluginMethod
  public void click(PluginCall call) {
    mainHandler.post(() -> {
      AgentAccessibilityService service = AgentAccessibilityService.getInstance();
      if (service == null) {
        call.reject("无障碍服务未连接");
        return;
      }
      boolean ok = false;
      if (call.hasOption("text")) {
        ok = service.clickByText(call.getString("text", ""));
      } else if (call.hasOption("x") && call.hasOption("y")) {
        ok = service.clickPoint(call.getInt("x", 0), call.getInt("y", 0));
      }
      JSObject ret = new JSObject();
      ret.put("ok", ok);
      call.resolve(ret);
    });
  }

  @PluginMethod
  public void scroll(PluginCall call) {
    mainHandler.post(() -> {
      AgentAccessibilityService service = AgentAccessibilityService.getInstance();
      if (service == null) {
        call.reject("无障碍服务未连接");
        return;
      }
      JSObject ret = new JSObject();
      ret.put("ok", service.scroll(call.getString("direction", "forward")));
      call.resolve(ret);
    });
  }

  @PluginMethod
  public void key(PluginCall call) {
    mainHandler.post(() -> {
      AgentAccessibilityService service = AgentAccessibilityService.getInstance();
      if (service == null) {
        call.reject("无障碍服务未连接");
        return;
      }
      JSObject ret = new JSObject();
      ret.put("ok", service.key(call.getString("action", "back")));
      call.resolve(ret);
    });
  }

  @PluginMethod
  public void openApp(PluginCall call) {
    mainHandler.post(() -> {
      AgentAccessibilityService service = AgentAccessibilityService.getInstance();
      if (service == null) {
        call.reject("无障碍服务未连接");
        return;
      }
      JSObject ret = new JSObject();
      ret.put("ok", service.openApp(call.getString("packageName", "")));
      call.resolve(ret);
    });
  }

  @PluginMethod
  public void listApps(PluginCall call) {
    Intent mainIntent = new Intent(Intent.ACTION_MAIN);
    mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
    List<ResolveInfo> apps = getContext().getPackageManager().queryIntentActivities(mainIntent, 0);
    JSArray result = new JSArray();
    for (ResolveInfo info : apps) {
      if (info == null || info.activityInfo == null) continue;
      JSObject app = new JSObject();
      app.put("name", String.valueOf(info.loadLabel(getContext().getPackageManager())));
      app.put("packageName", info.activityInfo.packageName);
      result.put(app);
    }
    JSObject ret = new JSObject();
    ret.put("apps", result);
    call.resolve(ret);
  }

  @PluginMethod
  public void typeText(PluginCall call) {
    mainHandler.post(() -> {
      AgentAccessibilityService service = AgentAccessibilityService.getInstance();
      if (service == null) {
        call.reject("无障碍服务未连接");
        return;
      }
      JSObject ret = new JSObject();
      ret.put("ok", service.typeText(call.getString("text", "")));
      call.resolve(ret);
    });
  }

  private boolean isServiceEnabled() {
    AccessibilityManager manager = (AccessibilityManager) getContext().getSystemService(android.content.Context.ACCESSIBILITY_SERVICE);
    if (manager == null) return false;
    List<AccessibilityServiceInfo> services = manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
    String expectedName = AgentAccessibilityService.class.getName();
    for (AccessibilityServiceInfo info : services) {
      if (info != null && info.getResolveInfo() != null
          && expectedName.equals(info.getResolveInfo().serviceInfo.name)) {
        return true;
      }
    }
    return false;
  }
}
