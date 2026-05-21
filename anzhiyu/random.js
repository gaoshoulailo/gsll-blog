var posts=["2026/05/21/hello-world/","2026/05/19/Hexo-博客完整部署到-GitHub-教程（Windows-版）/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };