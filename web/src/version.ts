export const APP_VERSION = '0.1.4';

export interface ReleaseNote {
  version: string;
  date: string;
  notes: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.4',
    date: '2026-08-03',
    notes: [
      '新增版本与更新说明页面',
      '无障碍授权支持一键关闭（可重新到系统设置开启）',
      '手机控制默认开启'
    ]
  },
  {
    version: '0.1.3',
    date: '2026-08-03',
    notes: [
      '新增无障碍手机控制：读取屏幕、点击、滚动、返回、打开 App、输入文字',
      '设置页新增“手机控制”入口'
    ]
  },
  {
    version: '0.1.2',
    date: '2026-08-03',
    notes: ['清空对话后允许 0 条对话，不再自动保留空对话']
  },
  {
    version: '0.1.1',
    date: '2026-08-03',
    notes: [
      '支持直接读取全部文件（需系统“所有文件访问”权限）',
      '写入文件前必须审批',
      '对话输出自动跟随'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-08-02',
    notes: [
      '首个版本：手机独立 Agent',
      '多服务商模型配置',
      '搜索、手机文件、本地任务',
      'MCP、网络代理、OCR 识图',
      '主题切换与对话管理'
    ]
  }
];
