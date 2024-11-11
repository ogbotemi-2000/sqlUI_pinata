function urlParts(url, params, query, is_html) {
    params = {}, query='',
    url.replace(/\?[^]*/, e=>((query=e.replace('?', '')).split(/\&|\s/).filter(e=>e).forEach(e=>params[(e=e.split('='))[0]]=decodeURIComponent(e[1])), '')),
    query &&= '?'+query,
    is_html = !/\.[^]+$/.test(is_html = (url = url.replace(query, '')).split('/').pop())||/\.html$/.test(is_html);
    return {
        params, query: decodeURIComponent(query), url, is_html
    }
}

function parseMultipart(req, data, bound, split) {
  /** not re-inventing the wheel or anything but popular packages like
   * formidable, multer and multiparty didn't work for my use case of sending
   * large text encoded as multipart/form-data hence the custom solution below
   */
  let body = {};
  req.headers['content-type'].replace(/=-+[^]+$/, match=>bound = match.replace(/=-+/, ''));
  split = new RegExp(`\\s*-*${bound}[^;]+(;|-+)\\s*`), data = data.split(split).filter(e=>e.length>1),
  data.forEach(e=>{
    let rgx = /^name="[^"]+"/ , value = e.split(rgx).filter(e=>e);
    e.replace(rgx, match=>body[match.replace(/name=|"/g, '')] = value.length ? value.shift().trim() : '')
  });
  return body;
}

module.exports = { urlParts, parseMultipart }