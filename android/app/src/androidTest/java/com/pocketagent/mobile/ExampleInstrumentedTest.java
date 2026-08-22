package com.pocketagent.mobile;

import static org.junit.Assert.*;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented test, which will execute on an Android device.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void useAppContext() throws Exception {
        // Context of the app under test.
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("com.pocketagent.mobile", appContext.getPackageName());
    }

    @Test
    public void mainActivityLaunches() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        Activity activity = InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
        assertEquals("com.pocketagent.mobile", activity.getPackageName());
        activity.finish();
    }
}
