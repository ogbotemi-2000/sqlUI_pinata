# neon-starter-kit
A starter kit for users using Node.js and/or Vercel serverless for getting started with or extending connecting and interacting with their PostgreSQL or MySQL databases hosted by direct effort or abstracted away via serverless SAAS like https://neon.tech

https://github.com/user-attachments/assets/76a37d61-23df-4a4a-a811-48cae1632a53

### Features
- [x] A `HTTP` Node.js server with dynamic support for middlewares and routes to `api/` endpoints
- [x] Compatibility with Vercel serverless functions
- [x] Custom configuration via config.json
- [x] A user interface for complete interaction with database
- [x] Option to enable `pooled connection` for database operation
- [x] Thorough testing of database via queries, the server never crashes; it returns detailed errors instead
- [x] Ready to use templates for directives `SELECT`, `DROP`, `ALTER`, `CREATE`, `INSERT` and `UPDATE`
- [x] Editing support for queries in a basic HTML editor with formatting and styling
- [x] Dropdown containing various datatypes available in SQL for input types that store the type of data for a field - `VARCHAR(255), INT...`
- [x] Automatic addition of ending semi-colon if absent

### Prerequisites
+ `node ^v16.18.2`
+ `npm ^v10.8.2`
+ `config.json` needs to be created in the root directory of the project and it should contain these fields
```json
{
  "PGHOST": "<DATABASE_HOST_ADDRESS>",
  "PGDATABASE": "<DATABASE_NAME>",
  "PGUSER": "<DATABASE_OWNER>",
  "PGPASSWORD": "******************",
  "ENDPOINT_ID": "<DATABASE_ENDPOINT>"
}
```
`config.json` is used as a more ergonomic alternative to `.env` file
 
### Installation
#### Clone the repo
```sh
git clone https://github.com/shravan20/neon-starter-kt.git
```
#### Install dependencies
```sh
cd neon-starter-kit && npm install
```
#### Create a `config.json` file in root directory
Provide a `config.json` file with what would be environment variables for local development and testing

### Code structure
```sh
| - server.js  # contains concise routing for GET and POST requests
| - index.html # contains UI for database interaction
| - config.json # is expected to be provided in cloned repo by user
| - css
| - js
| - fonts
| - webfonts
| - api # contains endpoints invoked by the Node.js server or Vercel
| - package.json 
```
The `api` folder contains the `accountData.js` file that is invoked as a module for post requests to `api/accountData`

### For both Vercel and Node.js
The `server.js` file behaves similarly to the server spawned by `vercel dev` however, the `node` server is much faster and aids quicker development. Migrating to Vercel is as easy as replacing `config.json` with `.env` and `dotenv`. The behaviour of the `api/accountData` route is the same for both Vercel and Node.

### Running locally
```sh
npm run dev
```
### Awareness
+ The server exits with a console warning if `config.json` is not available, the `PORT` you define in `config.json` is used or `3000` is used if it is not defined.
+ The Node.js sever doesn't support `vercel.json` since it is just a simple HTTP server built for speed and interoperability with Vercel functions
+ > Tip: The lines of text in the editor can be copied and pasted with their formatting retained! You can use this feature to create multiple fields.
