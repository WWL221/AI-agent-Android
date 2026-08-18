package com.pocketagent.mobile;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScheduledAction")
public class ScheduledAction extends Plugin {

  @PluginMethod
  public void scheduleOpenApp(PluginCall call) {
    try {
      String id = call.getString("id");
      long triggerAt = call.getLong("triggerAt", 0L);
      String packageName = call.getString("packageName", "");
      String appName = call.getString("appName", "");
      boolean repeatDaily = call.getBoolean("repeatDaily", false);
      if (id == null || id.isEmpty() || triggerAt <= 0) {
        call.reject("invalid scheduled action");
        return;
      }
      scheduleOpenAppInternal(getContext(), id, triggerAt, packageName, appName, repeatDaily);
      JSObject ret = new JSObject();
      ret.put("ok", true);
      call.resolve(ret);
    } catch (Exception ex) {
      call.reject(ex.getMessage() == null ? "schedule failed" : ex.getMessage());
    }
  }

  @PluginMethod
  public void cancel(PluginCall call) {
    try {
      String id = call.getString("id");
      if (id == null || id.isEmpty()) {
        call.reject("invalid id");
        return;
      }
      Intent intent = new Intent(getContext(), ScheduledActionReceiver.class);
      intent.setAction("com.pocketagent.mobile.SCHEDULED_APP_ACTION");
      PendingIntent pi = PendingIntent.getBroadcast(
          getContext(),
          id.hashCode(),
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );
      AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
      if (am != null) {
        am.cancel(pi);
      }
      pi.cancel();
      JSObject ret = new JSObject();
      ret.put("ok", true);
      call.resolve(ret);
    } catch (Exception ex) {
      call.reject(ex.getMessage() == null ? "cancel failed" : ex.getMessage());
    }
  }

  static void scheduleOpenAppInternal(
      Context context,
      String id,
      long triggerAt,
      String packageName,
      String appName,
      boolean repeatDaily
  ) {
    Intent intent = new Intent(context, ScheduledActionReceiver.class);
    intent.setAction("com.pocketagent.mobile.SCHEDULED_APP_ACTION");
    intent.putExtra("id", id);
    intent.putExtra("triggerAt", triggerAt);
    intent.putExtra("packageName", packageName);
    intent.putExtra("appName", appName);
    intent.putExtra("repeatDaily", repeatDaily);

    PendingIntent pi = PendingIntent.getBroadcast(
        context,
        id.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (am == null) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
    } else {
      am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
    }
  }
}
