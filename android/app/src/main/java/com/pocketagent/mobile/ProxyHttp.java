package com.pocketagent.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "ProxyHttp")
public class ProxyHttp extends Plugin {
  @PluginMethod
  public void request(PluginCall call) {
    String method = call.getString("method", "GET");
    if (method == null || method.isEmpty()) {
      method = "GET";
    }
    method = method.toUpperCase();
    String url = call.getString("url", "");
    String proxyUrl = call.getString("proxyUrl", "");
    JSObject headers = call.getObject("headers", new JSObject());
    String body = call.getString("body", null);

    if (url.isEmpty()) {
      call.reject("url is required");
      return;
    }
    if (proxyUrl.isEmpty()) {
      call.reject("proxyUrl is required");
      return;
    }

    try {
      Proxy proxy = parseProxy(proxyUrl);
      HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection(proxy);
      connection.setRequestMethod(method);
      connection.setConnectTimeout(30000);
      connection.setReadTimeout(30000);
      connection.setInstanceFollowRedirects(true);

      for (Iterator<String> it = headers.keys(); it.hasNext(); ) {
        String key = it.next();
        connection.setRequestProperty(key, headers.getString(key));
      }

      if (body != null && !body.isEmpty() && !"GET".equals(method) && !"HEAD".equals(method)) {
        connection.setDoOutput(true);
        try (OutputStream os = connection.getOutputStream()) {
          os.write(body.getBytes(StandardCharsets.UTF_8));
        }
      }

      int status = connection.getResponseCode();
      InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
      String text = readAll(input);
      Object data;
      try {
        data = new JSObject(text);
      } catch (Exception ex) {
        data = text;
      }

      JSObject ret = new JSObject();
      ret.put("status", status);
      ret.put("data", data);
      ret.put("text", text);
      JSObject responseHeaders = new JSObject();
      Map<String, List<String>> headerFields = connection.getHeaderFields();
      for (Map.Entry<String, List<String>> entry : headerFields.entrySet()) {
        if (entry.getKey() != null && entry.getValue() != null && !entry.getValue().isEmpty()) {
          responseHeaders.put(entry.getKey(), entry.getValue().get(0));
        }
      }
      ret.put("headers", responseHeaders);
      connection.disconnect();
      call.resolve(ret);
    } catch (Exception ex) {
      call.reject(ex.getMessage() == null ? "proxy request failed" : ex.getMessage());
    }
  }

  private Proxy parseProxy(String proxyUrl) throws Exception {
    URL parsed = new URL(proxyUrl);
    int port = parsed.getPort();
    if (port < 0) {
      port = "https".equalsIgnoreCase(parsed.getProtocol()) ? 443 : 80;
    }
    String protocol = parsed.getProtocol() == null ? "" : parsed.getProtocol().toLowerCase();
    if (protocol.startsWith("socks")) {
      return new Proxy(Proxy.Type.SOCKS, new InetSocketAddress(parsed.getHost(), port));
    }
    return new Proxy(Proxy.Type.HTTP, new InetSocketAddress(parsed.getHost(), port));
  }

  private String readAll(InputStream input) throws Exception {
    if (input == null) return "";
    StringBuilder sb = new StringBuilder();
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        sb.append(line).append('\n');
      }
    }
    return sb.toString();
  }
}
