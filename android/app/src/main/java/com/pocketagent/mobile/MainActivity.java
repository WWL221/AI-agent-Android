package com.pocketagent.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(ProxyHttp.class);
    super.onCreate(savedInstanceState);
  }
}
