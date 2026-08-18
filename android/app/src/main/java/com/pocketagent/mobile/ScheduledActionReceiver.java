package com.pocketagent.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ScheduledActionReceiver extends BroadcastReceiver {

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;

    String id = intent.getStringExtra("id");
    String packageName = intent.getStringExtra("packageName");
    String appName = intent.getStringExtra("appName");
    boolean repeatDaily = intent.getBooleanExtra("repeatDaily", false);
    long triggerAt = intent.getLongExtra("triggerAt", 0L);

    if (packageName != null && !packageName.trim().isEmpty()) {
      try {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(packageName.trim());
        if (launch != null) {
          launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
          context.startActivity(launch);
        }
      } catch (Exception ignored) {
        // 某些应用可能不允许后台直接拉起，忽略。
      }
    }

    if (repeatDaily && id != null && !id.isEmpty() && triggerAt > 0) {
      ScheduledAction.scheduleOpenAppInternal(
          context,
          id,
          triggerAt + 86400000L,
          packageName,
          appName,
          true
      );
    }
  }
}
