var posts=["2026/05/21/hello-world/","2026/05/28/Frida_Java_perform_常见错误排查与解决方案_优化版/","2026/05/18/Hexo-博客完整部署到-GitHub-教程（Windows-版）/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };