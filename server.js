let http   = require('http'),
    fs     = require('fs');

if(!fs.existsSync('./config.json')) console.warn("::Create a `config.json` file with the fields required for a neondatabase for proper behaviour"), process.exit();

let path   = require('path'),
    config = require('./config.json'),
    mime   = require('mime-types'),
    jobs   = {
      GET:function(req, res, parts, fxn) {
        /** middlewares that respond to GET requests are called here */
        fxn = fs.existsSync(fxn='.'+parts.url+'.js')&&require(fxn)
        if(parts.query) req.query = parts.params, fxn&&fxn(req, res);
        return !!fxn;
      },
      POST:function(req, res, parts, fxn, bool) {
        fxn = fs.existsSync(fxn='.'+parts.url+'.js')&&require(fxn),
        req.on('data', function(data) {
          /**create req.body and res.json because the invoked module requires them to be defined */
          req.body = /\{|\}/.test(data=data.toString()) ? { data }
          : (parts = urlParts('?'+data)).params,
          fxn&&fxn(req, res)
        });
        if(!fxn) res.end();
        /** decided to return true instead of !!fxn since POST requests are not expected to GET html resources */
        return !!fxn||bool;
      }
    },
    cache  = {}; /** to store the strings of data read from files */

http.createServer((req, res, url, parts, data, verb)=>{
  ({ url } = parts =  urlParts(req.url)),
  /** data expected to be sent to the client, this approach does away with res.write and res.send in the jobs */
  res.json=obj=>res.end(JSON.stringify(obj)), // for vercel functions
  data = jobs[verb=req.method](req, res, parts),

  url = url === '/' ? 'index.html' : url,
  /** the code below could be moved to a job but it is left here to prioritize it */
  data || new Promise((resolve, rej, cached)=>{
    if (data) { resolve(/*dynamic data, exit*/); return; }

    /*(cached=cache[req.url])?resolve(cached):*/fs.readFile(path.join('./', url), (err, buf)=>{
      if(err) rej(err);
      else resolve(cache[req.url]=buf)
    })
  }).then(cached=>{
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-type': mime.lookup(url) || 'application/octet-stream'
   }),
   /** return dynamic data or static file that was read */
    // console.log("::PROMISE", [url]),
    res.end(cached)
  }).catch((err, str)=>{
    str='::ERROR:: '+err,
    // console.error(str='::ERROR:: '+err, [url])
    res.end(str)
  })
}).listen(config.PORT||=3000, _=>{
  console.log(`Server listening on PORT ${config.PORT}`)
})

function urlParts(url, params, query, is_html) {
    params = {}, query='',
    url.replace(/\?[^]*/, e=>((query=e.replace('?', '')).split('&').forEach(e=>params[(e=e.split('='))[0]]=decodeURIComponent(e[1])), '')),
    query &&= '?'+query,
    is_html = !/\.[^]+$/.test(is_html = (url = url.replace(query, '')).split('/').pop())||/\.html$/.test(is_html);
    return {
        params, query: decodeURIComponent(query), url, is_html
    }
}
/** write ENV variables to process.env if available */
fs.readFile('.env.development.local', (err, data)=>{
  if(err) { /*console.error(err); */return; }
  data.toString().replace(/\#[^\n]+\n/, '').split('\n').filter(e=>e)
  .forEach(el=>{
    let { 0:key, 1:value } = el.split('=');
    process.env[key] = value.replace(/"/g, '');
    // console.log(process.env[key])
  })
})