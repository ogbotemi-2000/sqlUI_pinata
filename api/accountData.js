let data   = {},
fs         = require('fs'),
path       = require('path'),
file       = path.join(require('../rootDir')(__dirname), './sql_ui_config.json'),
both       = require('../js/both'),
dB,
stringErr  = (err, cause, fix)=>[`"${err.message}"<center>----------</center>${cause}, code: ${err.code} with severity: \`${err.severity||'&lt;N/A&gt;'}\` for sqlState: \`${err.sqlState||'&lt;N/A&gt;'}\`, at position \`${err.position||'&lt;N/A&gt;'}\` for operation \`${err.routine||'&lt;N/A&gt;'}\``, fix],
isMySQL;

module.exports = function(request, response) {
  let { local, pooled, query, setup } = request.body||request.query, /** to accommodate get or post requests via this server or Vercel serverless */
  config=fs.existsSync(file)&&require(file),
  stored = (config||{ }).CONNECTION_STRING;

  data.result='', data.errors = [];
  // console.log('::SETUP::', [setup, config, __dirname]);
  
  if(setup||stored) {
    config&&(config.CONNECTION_STRING = setup||stored||''), config||={ CONNECTION_STRING: setup||stored },
    local&&('::WRITING CONFIGS::', fs.writeFileSync(file, both.format(JSON.stringify(config))));
    if(!query) dB = null; /** absent query and present setup implies re-configuration of the app 
      with a different(enforced by the client) connection string which requires reconnecting the database
      driver with the new URL
    */
    isMySQL = /^mysql/.test(setup||stored),
    
    data.configured =  setup!=stored
    ? setup||stored/**sent the stored db string the very first time to synchronize with client */
    : /*a truthy instead of stored db string for security*/1,
    
    /** settiing dB = null destroys the closure below due to ||=, in order to update connectionString:setup after errors or re-configurations */
    setup&&(dB ||= require('../db')({isMySQL, connectionString:setup})) /** avoid requring module and invoking its exported function from scratch until either set to null or destroyed in serverless functions*/
    .then(operate)
    .catch(err=>{
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
    if(query = query.replace(/\++/g, '\t')) db.query(query).then(arr=>{
      data.result = isMySQL ? arr[0] : arr
    }).catch(err=>data.errors[0] = stringErr(err, `Query: \`${query.split(/\s/).shift()}\``, 'Write syntactically correct queries and only specify fields or tables present in the the database or operations supported by the provider'))
    .finally(_=>response.json(data));
    
    else {
      let count = 0;/**used outside of loop cause the promsified nature makes the index i unreliable */
      /** added condition to avoid errors from reading non-existent functions or fields*/
      ['version'].concat(isMySQL ? [] : ['inet_server_addr', 'inet_server_port']).forEach((query, i, a)=>{
        db.query(`select ${query}()`).then(arr=>{
          data[query.replace('inet_', '')] = (arr=arr.flat())[0][query]||arr[0][query+'()']
        })
        .catch(err=>data.errors[0] = ['::DATABASE CONNECTION:: '+(/*data.version=*/err.message), 'Connect to the internet and/or remove typos in the environment variables for connecting the database'])
        .finally(_=>{
          if(!a[++count]) data.version = "VERSION • " + data.version, response.json(data);
        })
      })
    }
  }
}