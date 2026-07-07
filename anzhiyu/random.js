var posts=["2026/07/07/X货 APP unidbg-实战/","2026/05/28/Frida_Java_perform_常见错误排查与解决方案_优化版/","2026/06/12/雷池level2-排版优化版/","2026/06/08/凤凰新闻APP逆向实战/","2026/05/18/Hexo-博客完整部署到-GitHub-教程（Windows-版）/","2026/06/22/海南航空 App hnairSign签名分析 Unidbg 简单应用实战/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };