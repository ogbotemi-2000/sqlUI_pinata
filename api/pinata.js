let { PinataSDK } = require('pinata'),
    both          = require('../js/both'),
    fs            = require('fs'),
    path          = require('path'),
    filePath          = path.join(require('../rootDir')(__dirname), './sql_ui_config.json'),
    config        = fs.existsSync(filePath)&&require(filePath),
    pinata;

function upload(file, name, buffer, date) {
  date = new Date, buffer = Buffer.from(file, 'utf-8'),
  /** File object in similar fashion to the one present in browsers */
  // file = { buffer, name, type: 'text/plain', size: buffer.length, lastModified: +date, lastModifiedDate: date.toISOString() },
  file = new Blob([file], { type: 'text/plain' });
  return pinata.upload.file(file)
}

module.exports = async function(request, response) {
  let { data } = request.body||request.query;

  /** hardcoded string for splittig both on the client and server */
  data=data.slice(data.indexOf('=')+1).split('<_8c23#_>'),
  pinata = new PinataSDK({
    pinataGateway: data[2],
    pinataJwt: data[3]
  });
  /** write the provided data into files */
  config&&(config.PINATA_GATEWAY = data[2], config.PINATA_JWT = data[3]), 
  config||={ PINATA_GATEWAY: data[2], PINATA_JWT: data[3] },

  fs.writeFile(filePath, both.format(JSON.stringify(config)), _=>_)

  // pinata.testAuthentication().then()

  if(!data[4]) {
    let res
    //if CID is not in sent in data
    upload(data[0], data[1])
    .then(json=>{ console.log('::JSON::', res = json) })
    .catch(err=>{ console.log('::ERROR::', res = err) })
    .finally(_=>response.json(res))
  } else {
    let res;
    pinata.gateways.get(data[4])
    .then(file=>console.log('::RETRIEVED::', res = file))
    .catch(error=>console.log('::RETRIEVED::ERRORED::', res = error))
    .finally(_=>response.json(res))
  }
}