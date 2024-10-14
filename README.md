# sqlUI_pinata
A production-ready SQL RDBMS (MySQL or PostgreSQL) UI webapp that accepts and stores database connection strings and executes queries, edited in a basic IDE by the user, in a crash-free manner whereby errors are intuitively shown to the user for correction or learning.
Databases can be changed on the fly by configuring them with the webapp, with support for connection pooling and support for uploading SQL queries and responses to the IPFS via Pinata

https://github.com/user-attachments/assets/76a37d61-23df-4a4a-a811-48cae1632a53

### Features
- [x] A `HTTP` Node.js server with dynamic support for middlewares and routes to `api/` endpoints
- [x] Dynamic switching between `MySQL` and/or `PostgreSQL` databses without mixups as configured by the user anytime 
- [x] Compatibility with Vercel serverless environment
- [x] Custom configuration that gets persisted until changed
- [x] A user interface for complete interaction with database
- [x] Option to enable `pooled connection` for database operations
- [x] Thorough testing of database via queries, the server never crashes; it returns detailed errors instead
- [x] Ready to use templates for directives `SELECT`, `DROP`, `ALTER`, `CREATE`, `INSERT` and `UPDATE`
- [x] Editing support for queries in a basic HTML editor with formatting and styling
- [x] Dropdown containing various datatypes - `VARCHAR(255), INT...`, available in SQL. The input elements that have dropdowns are easily duplicated via copy-pasting
- [x] Automatic addition of ending semi-colon to queries if absent
- [x] Widget to receive secret credentials and gateways for uploading queries and responses to Pinata. The provided data are equally persisted in `sql_ui_config.json`


### Prerequisites
+ Database connection string to a database hosted somewhere
+ Optional `JWT` and `Gateway` strings for `Pinata`, they are based on a need to use basis
> All requisite strings, when needed, are stored in a `.json` file as opposed to a `.env` for a quicker and more natural reading and writing of configs
#### For vercel
Since Vercel functions are not allowed to create files on the fly, provide all needed configurations for the webapp when needed and deploy the then created `sql_ui_config.json` file along with the rest on Vercel. The server is written to mimick how Vercel invokes serverless functions and create methods and properties on `request` and `response`    
 
### Installation
#### Clone the repo
```sh
git clone https://github.com/ogbotemi-2000/sqlUI_pinata.git
```
#### Install dependencies
```sh
cd sqlUI_pinata && npm install
```
#### Provide URL to database to for app to create `sql_ui_config.json` file in root directory
A dialog always appears on pageload to either receive the database connection string or display the stored string as it is being used to setup the app after which the dialog disappears 

### Code structure
```sh
| - server.js  # contains concise routing for GET and POST requests
| - index.html # contains UI for database interaction
| - config.json # is expected to be provided in cloned repo by user
| - css
| - js
| - api/pinata.js # handles uploading and retrieving data through Pinata
| - rootDir.js # returns path to root directory for compatibility in Node or Vercel environment when creating `sql_ui_config.json`
| - db.js # handles switching between `MySQL` or `PostgreSQL` databases for pooled or regular connections
| - fonts
| - webfonts
| - api/accountData.js # handles everything else aside connecting with Pinata
| - package.json
```


### Running locally
```sh
npm start
```
### Awareness
+ A sudden network disconnect for a database connected over the internet leads to the only error that crashes the webapp's server.
+ Using `nodemon` via `npm run dev` or otherwise occassionally leads to wrong behaviour when setting up the app with a connection string
+ Some database hosting services like `Neon.tech` return connection errors when the conneection is pooled, a workaround is to append `-pooler` to the host part of the database, turn off pooling and let the provider handle the rest 

### Online Deployment
+ In the works but, by not storing any client data server side and avoiding mixups in the process, database connection strings provided can be provided to the webapp's server which queues the requests and responds appropriately. 
