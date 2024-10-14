let mysql 					   = require('mysql2/promise'),
	both  					   = require('./js/both'),
	/** using neon driver instead of pg because of a strange ETIMEDOUT error */
	{ Pool, neon, neonConfig } = require('@neondatabase/serverless'),
	ws 						   = require('ws');

/** setting up PostgreSQL driver for pooling */
neonConfig.webSocketConstructor = ws;

let db = {
  cb: _=>_, conn: [],
  /** minimalist eventEmitter-like code structure to ensure proper behaviour */
  on: function(ev, cb, conn){
		if(ev==='pooled') this.cb=cb;
		  (conn = db.conn[+!!db.pooled])&&cb(conn)
	},   
	query: function(query) {
		return new Promise((res, rej)=>{
			/** the makeshift event-callback pattern below is needed to avoid errors when the connection is pooled - which seems to take a fraction longer */
			this.on('pooled', function(conn) {
			  conn.query(query).then(args=>res(args)).catch(err=>rej(err)),
				db.pooled&&(conn.release(), db.pool&&db.pool.end() /** for pooled PostgreSQL db */)
			})
		})
	  }
	}

module.exports = function(args, err_cb, parts, config={}) {

	(parts = both.dBParts(args.connectionString)).shift(),
	['user', 'password', 'host', 'port', 'database'].forEach((key, i)=>config[key]=parts[i]),
	parts[5]&&parts[5].split('&').forEach(param=>{
		let [key, value]  = param.split('=');
		config[key.replace(/_[^]/, a=>a.replace('_', '').toUpperCase())] = value
	});
	return new Promise(async (resolve, reject)=>{
		if(args.isMySQL) {
			/** tried using Promise.all([...]) to implement similar .then and .catch callbacks but it appears pooled connections doesn't quite resolve when fulfilled with non-pooled
			 * i.e, in Promise.all([...]).then(_=>resolve(db)), resolve(db) seems to never be called with the pooled connection as a likely culprit for this
			 */
			mysql.createConnection(config).then(conn=>db.cb(db.conn[0]=conn, resolve(db))).catch(reject),
			await mysql.createPool(config).getConnection().then(conn=>db.cb(db.conn[1]=conn, resolve(db))).catch(reject),
			db.pool=null/** to avoid errors from calling `end` on a pool that is not from a PostgreSQL connection */
		} else {
			let connectionString=args.connectionString, pool = new Pool({ connectionString }),
			query;

			pool.on('error', err=>console.log('::POOL::ERROR', err)),
			(db.pool = pool).connect().then(client=>(db.conn[1]=client, resolve(db))).catch(reject);
			
			try { query = neon(connectionString), db.conn[0] = { query }/** for similar API for conn.query in db object */, resolve(db) }
			catch (err) { reject(err) }

		}
	})
}