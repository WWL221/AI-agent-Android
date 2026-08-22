package com.pocketagent.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ClickTargetMatcherTest {
  @Test
  public void matchesTextAndContentDescriptionCaseInsensitively() {
    assertTrue(ClickTargetMatcher.matches("NEXT", null, "next", true));
    assertTrue(ClickTargetMatcher.matches(null, "继续", "下一步", true));
  }

  @Test
  public void ignoresWhitespaceAndSupportsPartialLabels() {
    assertTrue(ClickTargetMatcher.matches("下 一 步 >", null, "下一步", false));
    assertTrue(ClickTargetMatcher.matches("下一步说明", null, "下一步", false));
    assertFalse(ClickTargetMatcher.matches("上一步", null, "下一步", true));
  }

  @Test
  public void doesNotMatchUnrelatedButtons() {
    assertFalse(ClickTargetMatcher.matches("取消", "关闭", "下一步", false));
  }
}
