hexo.extend.helper.register("catalog_list", function (type) {
  const url_for = this.url_for;
  let html = ``;
  hexo.locals.get(type).map(function (item) {
    const link = url_for(item.path);
    html += `
    <div class="catalog-list-item" id="${link}">
      <a href="${link}">
        ${item.name}
      </a>
    </div>
    `;
  });
  return html;
});
