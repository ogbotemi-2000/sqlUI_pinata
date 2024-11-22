let mysql 					   = require('mysql2/promise'),
	both  					   = require('./js/both'),
	/** using neon driver instead of pg because of a strange ETIMEDOUT error */
	pg						   =  require('pg'),
	{ Pool, Client }	   = pg,
	{ /*Pool,*/ neon, neonConfig } = require('@neondatabase/serverless'),
	ws 						   = require('ws'), 
	{ registerTypes }		   = require('pgvector/pg');

/** setting up PostgreSQL driver for pooling */
neonConfig.webSocketConstructor = ws;

let db = {
  cb: _=>_, conn: [],
  /** minimalist eventEmitter-like code structure to ensure proper behaviour */
  on: function(ev, cb, conn){
		if(ev==='pooled') this.cb=cb;
		(conn = db.conn[+!!db.pooled])&&cb(conn)
	},
	query: function(query, args) {
		return new Promise((res, rej)=>{
			/** the makeshift event-callback pattern below is needed to avoid errors when the connection is pooled - which seems to take a fraction longer */
			this.on('pooled', function(conn) {
			  conn.query(query, args).then(res).catch(rej),
			  db.pooled ? conn.release() : conn.end()
			})
		})
	  }
	}

module.exports = function(args, parts) {
	let { connectionString } = args,
	/** Neon.tech triggers ETIMEDOUT errors when drivers aside @neondatabase/serverless are used,
	 *  isNeon is required to make this distinction for PostgreSQL databases hosted on Neon.tech only
	 */
	isNeon,
	config = {}, asString=obj=>Object.defineProperty(obj, 'toString', {
		//enumerable defaults to false
		value: function() {
		  //'port' should be before 'database' in the object below for proper behavior 
		  let sort = {'://':'user', ':':'password', '@':'host', '_:_':'port', '/':'database'}
		  sort_vs  = Object.values(sort), kVs = Object.keys(this).map(key=>~sort_vs.indexOf(key)?'':`${key}=${this[key]}`).filter(e=>e).join('&');

		  return Object.keys(sort).map(key=>key.replace(/_/g, '')+this[sort[key]]).join('') + ('?'.repeat(!!kVs)) + kVs
		}
	});
	asString(config),

	(parts = both.dBParts(connectionString)).shift(),
	['user', 'password', 'host', 'port', 'database'].forEach((key, i)=>config[key]=parts[i]),
	parts[5]&&parts[5].split('&').forEach(param=>{
		let [key, value]  = param.split('=');
		config[key.replace(/_[^]/, a=>a.replace('_', '').toUpperCase())] = value
	}),
	isNeon = /\.neon\.tech/.test(parts[2]);
	
	return new Promise(async (resolve, reject)=>{
		if(args.isMySQL) {
			mysql.createConnection(config).then(conn=>db.cb(db.conn[0]=conn, resolve(db))).catch(reject),
			await mysql.createPool(connectionString).getConnection().then(conn=>db.cb(db.conn[1]=conn, resolve(db))).catch(reject),
			db.pool=null/** to avoid errors from calling `end` on a pool that is not from a PostgreSQL connection */
		} else {
			try {
				let _config = {...config};
				_config.host = _config.host.replace('.', '-pooler.'), asString(_config);
				/** Database hosting as a service products like Neon.tech always either return empty values or terminate pooled connections, a workaround
				 * to pooling on Neon.tech is  by changing the connection string to include 'pooler'
				 */
				let pool = new Pool({ connectionString: isNeon?(connectionString.split('://').shift()+_config):connectionString }), client;
				pool.on('error', err=>{ pool.end(), reject(err) }),
				pool.connect().then(pooled=>{
				  db.conn[1] = pooled,
				  resolve(db)
				}).catch(reject),

				db.conn[0] = isNeon 
				  ? { query:(query, args)=>neon(connectionString)(query, args) }/** put in an object for similar API for conn.query in db object */
				  : (client = new Client({ connectionString }), await client.connect(), client),
				/** create vector extension for operating on vector embeddings, registerTypes */
				await db.query('CREATE vector IF NOT EXISTS vector'), registerTypes(db.conn[0]),
				resolve(db)
			} catch (err) { reject(err) }
		}
	})
}