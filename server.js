let fs     = require('fs');
/** write ENV variables to process.env if available */
fs.readFile('.env.development.local', (err, data)=>{
  if(err) { /*console.error(err); */return; }
  data.toString().replace(/\#[^\n]+\n/, '').split('\n').filter(e=>e)
  .forEach(el=>{
    let { 0:key, 1:value } = el.split('=');
    process.env[key] = value.replace(/"/g, '');
    // console.log(process.env[key])
  })
});

let http   = require('http'),
    path   = require('path'),
    config = fs.existsSync('./config.json')&&require('./config.json')||{PORT: process.env.PORT||8000},
    mime   = require('mime-types'),
    { urlParts, parseMultipart }    = require('./utils'),
    jobs   = {
      GET:function(req, res, parts, fxn) {
        /** middlewares that respond to GET requests are called here */
        fxn = fs.existsSync(fxn='.'+parts.url+'.js')&&require(fxn)
        if(parts.query) req.query = parts.params, fxn&&fxn(req, res);
        return !!fxn;
      },
      POST:function(req, res, parts, fxn, buffer) {
        fxn = fs.existsSync(fxn='.'+parts.url+'.js')&&require(fxn), buffer=[],
        req.on('data', chunk=>buffer.push(chunk)),

        req.on('end', function(data) {
            data = Buffer.concat(buffer).toString('utf-8'),
            /** create req.body and res.json because invoked modules in Vercel require them to be defined */
            req.body = /multipart/.test(req.headers['content-type'])  ? parseMultipart(req, data)
            : (/** urlParts obtains the parameters for other enctypes as used below */
            /\{|\}/.test(data) ? { data }
            : (parts = urlParts('?'+data)).params),

          fxn&&fxn(req, res)
        });
        /* no issue of returning earlyo before the callback above since fxn gets its value early on*/
        if(!fxn) res.end();
        /** decided to return true instead of !!fxn since POST requests are not expected to GET html resources */
        return !!fxn;
      }
    },
    cache  = {}; /** to store the strings of data read from files */

http.createServer((req, res, url, parts, data, verb)=>{
  ({ url } = parts =  urlParts(req.url)),
  
  res.json=obj=>res.end(JSON.stringify(obj)), // for Vercel functions
  data = jobs[verb=req.method](req, res, parts),

  url = url === '/' ? 'index.html' : url,
  /** comment "data ||" out if your middlewares are built to return values to be sent as responses and not send back responses by themselves */
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
}).listen(config.PORT, _=>{
  console.log(`Server listening on PORT ${config.PORT}`)
})