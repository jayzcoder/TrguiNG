
## 基于 [openscopeproject/TrguiNG](https://github.com/openscopeproject/TrguiNG) 汉化并增加部分功能

### 更新 (240422a)
1. add: 目录分组增加复制路径功能
2. Issue #3 | fix: 一键URL访问跨域问题（简单转跳处理）
3. Issue #4 #10 | 合并 openscopeproject/TrguiNG:1.3.0
4. Issue #9 | impr: 隐藏/展示运行状态（右上角）
5. Issue #6 #7 #12 | 翻译调整
6. windows应用程序部分页面汉化补充

### 更新 (240417a)
1. fix: 体积支持 PB EB 展示
2. fix: 工具栏的一些同步问题
3. impr: version 页汉化

## 新增功能 (240416a)
1. 分组体积展示（可在分组区右键关闭该功能）
2. 双击全选分组，方便快捷操作（可在分组区右键关闭该功能）
3. 增加错误分布分组（可在分组区右键关闭该功能）
4. 增加分组后的Tracker二级过滤（位于顶部搜索框右侧）
5. 多链接下载，可设置下载间隔
6. 调整布局，左下角增加状态指示（主要用于多链接下载展示进度，平常展示列表选中项）
7. 种子列表右键菜单增加复制名称和路径（去重）

## PS. 主要是自用，有想加功能的可以提 issues，不保证实现

## 安装介绍（docker 环境）
1. 从 [releases](https://github.com/jayzcoder/TrguiNG/releases) 下载 `trguing-web-xxxx-zh.zip`
2. 解压到 transmission 设置的 webui 目录即可
3. transmission 需要正确映射并设置环境变量(确保 index.html 位于 TRANSMISSION_WEB_HOME 所在的目录第一层):
   ```
   TRANSMISSION_WEB_HOME=/config/webui/trguing-zh
   ```
