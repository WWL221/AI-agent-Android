package com.pocketagent.mobile;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Bundle;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.util.ArrayDeque;
import java.util.Deque;

public class AgentAccessibilityService extends AccessibilityService {
  private static AgentAccessibilityService instance;
  private String foregroundPackage = "";

  public static AgentAccessibilityService getInstance() {
    return instance;
  }

  @Override
  protected void onServiceConnected() {
    super.onServiceConnected();
    instance = this;
  }

  @Override
  public void onAccessibilityEvent(AccessibilityEvent event) {
    if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && event.getPackageName() != null) {
      foregroundPackage = String.valueOf(event.getPackageName());
    }
  }

  @Override
  public void onInterrupt() {
  }

  @Override
  public void onDestroy() {
    instance = null;
    super.onDestroy();
  }

  public String getForegroundPackage() {
    return foregroundPackage;
  }

  public JSObject getUiTree() {
    AccessibilityNodeInfo root = getRootInActiveWindow();
    JSObject ret = new JSObject();
    if (root == null) {
      ret.put("root", new JSObject());
      ret.put("packageName", foregroundPackage);
      return ret;
    }
    int[] counter = { 0 };
    ret.put("root", serialize(root, 0, counter));
    ret.put("packageName", foregroundPackage);
    root.recycle();
    return ret;
  }

  public boolean clickByText(String text) {
    if (text == null || text.trim().isEmpty()) return false;
    AccessibilityNodeInfo root = getRootInActiveWindow();
    if (root == null) return false;
    String target = text.trim().toLowerCase();
    boolean result = clickNode(root, target);
    if (!result) {
      result = clickDescendant(root, target);
    }
    root.recycle();
    return result;
  }

  public boolean clickPoint(int x, int y) {
    Path path = new Path();
    path.moveTo(x, y);
    GestureDescription gesture = new GestureDescription.Builder()
        .addStroke(new GestureDescription.StrokeDescription(path, 0, 80))
        .build();
    return dispatchGesture(gesture, null, null);
  }

  public boolean scroll(String direction) {
    AccessibilityNodeInfo root = getRootInActiveWindow();
    if (root == null) return false;
    AccessibilityNodeInfo scrollable = findScrollable(root);
    boolean result = false;
    if (scrollable != null) {
      if ("backward".equals(direction) || "down".equals(direction)) {
        result = scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD);
      } else {
        result = scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD);
      }
      scrollable.recycle();
    }
    root.recycle();
    if (result) return true;
    return swipe(direction);
  }

  public boolean key(String action) {
    switch (action) {
      case "back":
        return performGlobalAction(GLOBAL_ACTION_BACK);
      case "home":
        return performGlobalAction(GLOBAL_ACTION_HOME);
      case "recents":
        return performGlobalAction(GLOBAL_ACTION_RECENTS);
      default:
        return false;
    }
  }

  public boolean openApp(String packageName) {
    try {
      Intent launch = getPackageManager().getLaunchIntentForPackage(packageName);
      if (launch == null) return false;
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(launch);
      return true;
    } catch (Exception ex) {
      return false;
    }
  }

  public boolean typeText(String text) {
    if (text == null) return false;
    AccessibilityNodeInfo root = getRootInActiveWindow();
    if (root == null) return false;
    AccessibilityNodeInfo focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
    if (focused == null) {
      focused = findFocused(root);
    }
    boolean result = false;
    if (focused != null) {
      Bundle args = new Bundle();
      args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
      result = focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
      focused.recycle();
    }
    root.recycle();
    return result;
  }

  private JSObject serialize(AccessibilityNodeInfo node, int depth, int[] counter) {
    JSObject obj = new JSObject();
    if (node == null || depth > 12 || counter[0] > 600) {
      return obj;
    }
    counter[0] += 1;
    CharSequence text = node.getText();
    CharSequence desc = node.getContentDescription();
    obj.put("text", text == null ? "" : String.valueOf(text));
    obj.put("contentDescription", desc == null ? "" : String.valueOf(desc));
    obj.put("className", node.getClassName() == null ? "" : String.valueOf(node.getClassName()));
    obj.put("packageName", node.getPackageName() == null ? "" : String.valueOf(node.getPackageName()));
    obj.put("clickable", node.isClickable());
    obj.put("scrollable", node.isScrollable());
    obj.put("editable", node.isEditable());
    obj.put("focused", node.isFocused());
    Rect bounds = new Rect();
    node.getBoundsInScreen(bounds);
    JSArray box = new JSArray();
    box.put(bounds.left);
    box.put(bounds.top);
    box.put(bounds.right);
    box.put(bounds.bottom);
    obj.put("bounds", box);
    JSArray children = new JSArray();
    for (int i = 0; i < node.getChildCount() && counter[0] <= 600; i += 1) {
      AccessibilityNodeInfo child = node.getChild(i);
      children.put(serialize(child, depth + 1, counter));
      if (child != null) child.recycle();
    }
    obj.put("children", children);
    return obj;
  }

  private boolean clickNode(AccessibilityNodeInfo node, String target) {
    if (node == null) return false;
    if (node.isClickable() && matches(node, target)) {
      return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
    }
    return false;
  }

  private boolean clickDescendant(AccessibilityNodeInfo node, String target) {
    if (node == null) return false;
    Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
    queue.add(node);
    while (!queue.isEmpty()) {
      AccessibilityNodeInfo current = queue.poll();
      if (current == null) continue;
      if (current.isClickable() && matches(current, target)) {
        return current.performAction(AccessibilityNodeInfo.ACTION_CLICK);
      }
      for (int i = 0; i < current.getChildCount(); i += 1) {
        AccessibilityNodeInfo child = current.getChild(i);
        if (child != null) queue.add(child);
      }
    }
    return false;
  }

  private boolean matches(AccessibilityNodeInfo node, String target) {
    CharSequence text = node.getText();
    CharSequence desc = node.getContentDescription();
    if (text != null && String.valueOf(text).toLowerCase().contains(target)) return true;
    if (desc != null && String.valueOf(desc).toLowerCase().contains(target)) return true;
    return false;
  }

  private AccessibilityNodeInfo findScrollable(AccessibilityNodeInfo node) {
    if (node == null) return null;
    Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
    queue.add(node);
    while (!queue.isEmpty()) {
      AccessibilityNodeInfo current = queue.poll();
      if (current == null) continue;
      if (current.isScrollable()) return current;
      for (int i = 0; i < current.getChildCount(); i += 1) {
        AccessibilityNodeInfo child = current.getChild(i);
        if (child != null) queue.add(child);
      }
    }
    return null;
  }

  private AccessibilityNodeInfo findFocused(AccessibilityNodeInfo node) {
    if (node == null) return null;
    Deque<AccessibilityNodeInfo> queue = new ArrayDeque<>();
    queue.add(node);
    while (!queue.isEmpty()) {
      AccessibilityNodeInfo current = queue.poll();
      if (current == null) continue;
      if (current.isFocused() || current.isEditable()) return current;
      for (int i = 0; i < current.getChildCount(); i += 1) {
        AccessibilityNodeInfo child = current.getChild(i);
        if (child != null) queue.add(child);
      }
    }
    return null;
  }

  private boolean swipe(String direction) {
    Rect bounds = new Rect();
    if (getRootInActiveWindow() != null) {
      getRootInActiveWindow().getBoundsInScreen(bounds);
      getRootInActiveWindow().recycle();
    }
    int w = bounds.width() > 0 ? bounds.width() : 1080;
    int h = bounds.height() > 0 ? bounds.height() : 2400;
    int x1 = w / 2;
    int y1 = h / 2;
    int x2 = x1;
    int y2 = y1;
    if ("forward".equals(direction) || "down".equals(direction)) {
      y1 = (int) (h * 0.72f);
      y2 = (int) (h * 0.28f);
    } else {
      y1 = (int) (h * 0.28f);
      y2 = (int) (h * 0.72f);
    }
    Path path = new Path();
    path.moveTo(x1, y1);
    path.lineTo(x2, y2);
    GestureDescription gesture = new GestureDescription.Builder()
        .addStroke(new GestureDescription.StrokeDescription(path, 0, 300))
        .build();
    return dispatchGesture(gesture, null, null);
  }
}
