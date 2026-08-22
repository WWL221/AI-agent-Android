package com.pocketagent.mobile;

import java.text.Normalizer;
import java.util.Locale;

final class ClickTargetMatcher {
  private ClickTargetMatcher() {
  }

  static boolean matches(CharSequence text, CharSequence contentDescription, String target, boolean exact) {
    String wanted = normalize(target);
    if (wanted.isEmpty()) return false;
    return matchesValue(text, wanted, exact) || matchesValue(contentDescription, wanted, exact);
  }

  static String normalize(CharSequence value) {
    if (value == null) return "";
    return Normalizer.normalize(String.valueOf(value), Normalizer.Form.NFKC)
        .toLowerCase(Locale.ROOT)
        .replaceAll("\\s+", "")
        .trim();
  }

  private static boolean matchesValue(CharSequence value, String wanted, boolean exact) {
    String candidate = normalize(value);
    if (candidate.isEmpty()) return false;
    if (exact && candidate.equals(wanted)) return true;
    if (!exact && (candidate.contains(wanted) || wanted.contains(candidate))) return true;
    return isNextTarget(wanted) && isNextLabel(candidate);
  }

  private static boolean isNextTarget(String value) {
    return value.equals("下一步") || value.equals("next") || value.equals("continue") || value.contains("下一步");
  }

  private static boolean isNextLabel(String value) {
    return value.equals("下一步") || value.equals("继续") || value.equals("next") || value.equals("continue")
        || value.startsWith("下一步") || value.startsWith("continue") || value.startsWith("next");
  }
}
