let data   = {},
fs         = require('fs'),
path       = require('path'),
file       = path.join(require('../rootDir')(__dirname), './sql_ui_config.json'),
config = fs.existsSync(file)&&require(file)||{...process.env},
both       = require('../js/both'),
stringErr  = (err, cause, fix)=>[`"${err.message}"<center>----------</center>${cause}, code: ${err.code} with severity: \`${err.severity||'&lt;N/A&gt;'}\` for sqlState: \`${err.sqlState||'&lt;N/A&gt;'}\`, at position \`${err.position||'&lt;N/A&gt;'}\` for operation \`${err.routine||'&lt;N/A&gt;'}\``, fix],
{ toSql }  = require('pgvector/pg'),
{ parseMultipart }    = require('../utils'),
isMySQL;

module.exports = async function(request, response) {
  /** request.body is only undefined for enctype=multipart/form-data */
  let { local, pooled, query, setup, embedding, metadata } = request.body||=await new Promise(resolve=>{
    let buffer = [];
    request.on('data', chunk=>buffer.push(chunk)),
    request.on('end', function(data) {
      if(!buffer.length) return;
      data = Buffer.concat(buffer).toString('utf-8'),
      resolve(parseMultipart(request, data))
    })
  }), stored = config.CONNECTION_STRING, dBParts=both.dBParts(setup||stored), dB;
  /** make an array out of the received embedding to make toSql work properly */
  embedding = toSql(embedding.replace(/\[|\]/g, '').split(','));
 
  let qValues = { 1:[embedding], 2: [metadata, embedding] }, match = query.match(/\$[0-9]/g), 
  /* provide the empty values array with elements for queries that involve substitution
     the queryConfig values are intented to be used with the queries from the RAG widget
  */
  values = match?qValues[match.length].filter(e=>e):[], queryConfig = { text: query, values };

  /** clear results and errors for every single request */
  data.result='', data.errors = [];

  if(setup||stored) {
    config.CONNECTION_STRING = setup||stored||'';
    //The line of code below may be uncommented if it is desired for the service to store and configure the UI with the last stored connection string
    // local&&fs.writeFileSync(file, both.format(JSON.stringify(config)));

    if(!query) {
      /** absent query and present setup implies re-configuration of the app 
      with a different(enforced by the client) connection string which requires reconnecting the database
      driver with the new URL.
      Global variables or states can be resetted to null in this if block; 
    */
    }

    isMySQL = /^mysql/.test(setup||stored),
    data.configured =  setup!=stored
    ? setup||stored/**sent the stored db string the very first time to synchronize with client */
    : /*a truthy instead of stored db string for security*/1,
    
    setup&&(dB = require('../db')({isMySQL, connectionString:setup}))
    .then(operate).catch(err=>{
      data.errors[0] = stringErr(err, 'Cause: connection string provided for configuration contains a nonentity', 'Re-configure app and ensure that the provided database URL resolves to an actual database'),
      dB = null, response.json(data)
    });

    if(stored&&!setup) {
      /** provide pinata configs to sent data if available as UI gimmick that fills them there in the client */
      let res = { configured: setup||stored };
      ['JWT', 'GATEWAY'].forEach((env, value)=>{
        (value = config['PINATA_'+env])&&(res[env.toLowerCase()] = value)
      }),
      response.json(res)
    }
  } else return response.json({configured:0});

  
  /* section that actually applies custom queries to the database */
  function operate(db) {
    db.pooled = pooled;
    /*queryConfig is used exclusively on TimescaleDB hence the distinction
    */
    if(query) db.query(isMySQL ? query : queryConfig).then(arr=>{
      arr = arr.rows||arr,
      data.result = isMySQL ? arr[0] : arr
    }).catch(err=>data.errors[0] = stringErr(err, `Query: \`${query.split(/\s/).shift()}\``, 'Write syntactically correct queries and only specify fields or tables present in the the database or operations supported by the provider'))
    .finally(_=>response.json(data));
    
    else {
      let count = 0;/**used outside of loop cause the promsified nature makes the index i unreliable */
      /** added condition to avoid errors from reading non-existent functions or fields*/
      ['version'].concat(isMySQL ? [] : ['inet_server_addr', 'inet_server_port']).forEach((query, i, a)=>{
        db.query(`select ${query}()`).then(arr=>{
          arr = arr.rows||arr,
          data[query.replace('inet_', '')] = (arr=arr.flat())[0][query]||arr[0][query+'()']
        })
        .catch(err=>data.errors[0] = ['::DATABASE CONNECTION:: '+(/*data.version=*/err.message), 'Connect to the internet and/or remove typos in the environment variables for connecting the database'])
        .finally(_=>{
          if(!a[++count]) data.version = "VERSION • " + data.version, data.database=dBParts[5], response.json(data);
        })
      })
    }
  }
}