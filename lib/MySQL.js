/**
 * @module MySQL
 *
 * Note that his module requires the MySQL Connector/J JDBC .jar be installed
 * on the classpath.
 */
/*global toString, java */
"use strict";

var {Thread} = require('Threads'),
    {DriverManager, PreparedStatement, ResultSet, Statement, Types} = java.sql,
    // cache these types for speed
    {BIT, BOOLEAN} = Types,
    {TINYINT, BIGINT, SMALLINT, INTEGER} = Types,
    {REAL, FLOAT, DOUBLE, DECIMAL, NUMERIC} = Types,
    {VARBINARY, BINARY, LONGVARBINARY, LONGVARCHAR, CHAR, VARCHAR, CLOB, OTHER} = Types,
    {DATE, TIME, TIMESTAMP} = Types,
    {NULL} = Types;

const DEFAULT_EXPIRE = 15 * 60 * 60;

// implementation of connection pool
// quite simple and just a few lines of JavaScript
// TODO support pooling for multiple database connection types/URIs

var pool = [];

var getConnection = sync(function (url, encoding) {
    var conn,
        now = decaf.timestamp();

    while (pool.length) {
        conn = pool.pop();
        if (conn.expires >= now ) {
            conn = conn.conn;
            try {
                var statement = connection.createStatement();
                if (statement.executeQuery('SELECT 1')) {
                    return conn.conn;
                }
            }
            catch (e) {
                // something wrong with the connection, release it and try the next in the pool
            }
        }
        else {
            // expired
            try {
                conn = conn.conn;
                conn.close();
            }
            catch (e) {
                // did our best to close it
            }
        }
    }
    java.lang.Class.forName('org.mariadb.jdbc.Driver');
    conn = DriverManager.getConnection(url);
    return conn;
}, pool);

var releaseConnection = sync(function (conn) {
    pool.push({
        conn: conn,
        expires: decaf.timeStamp() + DEFAULT_EXPIRE
    });
}, pool);

// utility functions
function isArray(o) {
    return toString.apply(o) === '[object Array]';
}

// for quote
function addslashes(str) {
    return (str + '').replace(/([\\"'])/g, "\\$1").replace(/\0/g, "\\0");
}

function decodeByteArray(bytes) {
    if (!bytes) {
        return bytes;
    }
    return String(new java.lang.String(bytes));
}

// These config options to the constructor are handled specifically
// anything else is appended to the URI string (see constructor doc)
var knownConfigOptions = [
    'user',
    'passwd', 'password',   // aliases
    'db', 'database',       // aliases
    'host',
    'port'
//        ,
//        'encoding'
];

/**
 Get MySQL connection from the connection pool.

 The config parameter is an object which may contain these members:

 - user - MySQL username
 - passwd - MySQL password for user  (defaults to null, no password)
 - password - synonym for passwd above
 - db - name of MySQL database to connect
 - database - synonum for db
 - port - port MySQL server is listening on (optional, default is 3306)
 - encoding - MySQL encoding type, see MySQL documentation for "SET NAMES" commmand

 The config parameter may contain other key/value pairs not listed above.  These are
 simply appended on the end of the JDBC connection URL.  For example, if config contains:

 {
      useUnicode: true
 }

 The uri will include &useUnicode=true.

 @class MySQL
 @param config
 @constructor
 @example
 var MySQL = require('MySQL').MySQL,
 SQL = new MySQL(config);
 */
function MySQL(config) { // user, password, db, host, port) {
    if (typeof config === 'string') {
        config = {
            user    : config,
            password: arguments[1],
            db      : arguments[2]
        };
    }
    var user = config.user,
        password = config.passwd || config.password || '',
        db = config.database || config.db,
        host = config.host || 'localhost',
        port = config.port || 3306;

    var url = 'jdbc:mysql://' + host + ':' + port + '/' + db + '?user=' + user + '&password=' + password;
    url += '&autoReconnect=true';

    decaf.each(config, function (value, key) {
        if (knownConfigOptions.indexOf(key) === -1) {
            url += '&' + key + '=' + value;
        }
    });
    this.url = url;
    this.encoding = config.encoding;
}

decaf.extend(MySQL.prototype, {
    getConnection: function () {
        var me = Thread.currentThread();
        if (!me.SQL) {
            me.SQL = getConnection(this.url, this.encoding);
            if (!me.mysqlHandlerInstalled) {
                me.on('endRequest', this.releaseConnection);
                me.mysqlHandlerInstalled = true;
            }
        }
        // me.SQL = me.SQL || getConnection(this.url, this.encoding);
        return me.SQL;
    },

    releaseConnection: function () {
        var me = Thread.currentThread();
        if (me.SQL) {
            releaseConnection(me.SQL);
            delete me.SQL;
        }
        // releaseConnection(conn);
    },

    /**
     * @method destroy
     * @return {void}
     */
    destroy: function () {
        // releaseConnection(this.conn);
    },

    /**
     * Issue a read query and return result as an array of objects
     *
     * @method getDataRows
     * @param query
     * @return {Array} array of objects
     */
    getDataRows: function (query) {
        query = isArray(query) ? query.join('\n') : query;
        var connection = this.getConnection();
        connection.setReadOnly(true);
        var statement = connection.createStatement(),
            resultSet = statement.executeQuery(query),
            metaData = resultSet.getMetaData(),
            columns = metaData.getColumnCount(),
            types = [],
            names = [],
            i,
            bytes;

        for (i = 1; i <= columns; i++) {
            types[i] = metaData.getColumnType(i);
            names[i] = metaData.getColumnLabel(i);
        }

        var result = [];
        while (resultSet.next()) {
            var row = {};
            for (i = 1; i <= columns; i++) {
                switch (types[i]) {
                    case BIT:
                    case BOOLEAN:
                        row[names[i]] = Boolean(resultSet.getBoolean(i));
                        break;
                    case TINYINT:
                    case BIGINT:
                    case SMALLINT:
                    case INTEGER:
                        row[names[i]] = Number(resultSet.getLong(i));
                        break;
                    case REAL:
                    case FLOAT:
                    case DOUBLE:
                    case DECIMAL:
                    case NUMERIC:
                        row[names[i]] = Number(resultSet.getDouble(i));
                        break;
                    case VARBINARY:
                    case BINARY:
                    case LONGVARBINARY:
                        row[names[i]] = resultSet.getBytes(i);
                        break;
                    case LONGVARCHAR:
                    case CHAR:
                    case VARCHAR:
                    case CLOB:
                    case OTHER:
                        row[names[i]] = decodeByteArray(resultSet.getBytes(i));
                        break;
                    case DATE:
                    case TIME:
                    case TIMESTAMP:
                        row[names[i]] = resultSet.getInt(i); // getTimestamp(i);
                        break;
                    case NULL:
                        row[names[i]] = null;
                        break;
                    default:
                        console.log(types[i]);
                        row[names[i]] = String(resultSet.getString(i));
                        break;
                }
            }
            result.push(row);
        }
        try {
            statement.close();
            resultSet.close();
        }
        catch (e) {

        }
        this.releaseConnection(connection);
        return result;
    },

    /**
     * Issue a read query and return the first/only row returned as an object.
     *
     * @method getDataRow
     * @param query
     * @return {*}
     */
    getDataRow: function (query) {
        var rows = this.getDataRows(query);
        return rows[0];
    },

    /**
     * Issue an update query and return the number of rows in the database changed.
     *
     * @method update
     * @param query
     * @return {*}
     */
    update: function (query) {
        query = isArray(query) ? query.join('\n') : query;
        var connection = this.getConnection();
        connection.setReadOnly(false);
        var statement = connection.createStatement(),
            result;

        try {
            result = statement.executeUpdate(query);
            result = statement.getUpdateCount();
        }
        finally {
            try {
                statement.close();
            }
            catch (e) {

            }
        }
        this.releaseConnection(connection);
        return result;
    },

    replaceObject: function (table, o) {
        var keys = [],
            values = [],
            placeholders = [];
        decaf.each(o, function (value, key) {
            keys.push(key);
            values.push(value);
            placeholders.push('?');
        });
        var q = 'REPLACE INTO ' + table + ' (' + keys.join(',') + ') values (' + placeholders.join(',') + ')';

        var connection = this.getConnection();
        connection.setReadOnly(false);
        var statement = connection.prepareStatement(q),
            result;

        for (var i = 0, len = values.length; i < len; i++) {
            var value = values[i];
            switch (toString.apply(value)) {
                case '[object String]':
                    statement.setString(i + 1, value);
                    break;
                case '[object JavaArray]':
                    statement.setBytes(i + 1, value);
                    break;
                case '[object Number]':
                    if (('' + value).indexOf('.') !== -1) {
                        statement.setFloat(i + 1, value);
                    }
                    else {
                        statement.setInt(i + 1, value);
                    }
                    break;
                default:
                    statement.setString(i + 1, value);
                    break;
            }
        }
        try {
            result = statement.executeUpdate();
            result = statement.getUpdateCount();
        }
        finally {
            try {
                statement.close();
            }
            catch (e) {

            }
        }
        this.releaseConnection(connection);
        return result;
    },

    /**
     * Issue a read query and return the first column of the first/only row returned.
     *
     * Typically this is used with a query of the form "SELECT COUNT(*) FROM table WHERE ..."
     *
     * @method getScalar
     * @param query
     * @return {*}
     */
    getScalar: function (query) {
        var row = this.getDataRow(query);
        for (var i in row) {
            return row[i];
        }
        return undefined;
    },

    /**
     * Retrieves the ID generated for an AUTO_INCREMENT column by the previous query (usually INSERT or REPLACE).
     *
     * @returns {int} the ID.
     */
    insertId: function () {
        var id = this.getScalar('SELECT LAST_INSERT_ID()');
        return id;
    },

    /**
     * Begin a transaction
     *
     * @method startTransaction
     * @example
     SQL.startTransaction();
     try {
            // both these need to succeed or the database is corrupt!
            SQL.update(someScaryQuery);
            SQL.update(anotherScaryQuery);
            // success!
            SQL.commit();
        }
     catch (e) {
            SQL.rollback(); // undo any damage
            throw e;
        }
     */
    startTransaction: function () {
        this.update('START TRANSACTION');
    },

    /**
     * Commit a transaction
     *
     * @method commit
     * @example
     SQL.startTransaction();
     try {
            // both these need to succeed or the database is corrupt!
            SQL.update(someScaryQuery);
            SQL.update(anotherScaryQuery);
            // success!
            SQL.commit();
        }
     catch (e) {
            SQL.rollback(); // undo any damage
            throw e;
        }
     */
    commit: function () {
        this.update('COMMIT');
    },

    /**
     * Rollback a transaction
     *
     * @method rollback
     * @example
     SQL.startTransaction();
     try {
            // both these need to succeed or the database is corrupt!
            SQL.update(someScaryQuery);
            SQL.update(anotherScaryQuery);
            // success!
            SQL.commit();
        }
     catch (e) {
            SQL.rollback(); // undo any damage
            throw e;
        }
     */
    rollback: function () {
        this.update('ROLLBACK');
    },

    /**
     * Quote and escape a string to be used as part of a query.
     *
     * The string is surrounded with single quotes and anything in the string that needs to be escaped is escaped.
     *
     * @method quote
     * @param {string} s the string to quote/escape
     * @return {string} the quoted string
     */
    quote: function (s) {
        if (isArray(s)) {
            var ret = [];
            decaf.each(s, function (e) {
                ret.push(MySQL.prototype.quote(e));
            });
            return ret;
        }
        else if (s === null || s === undefined) {
            return 'NULL';
        }
        else if (s === true || s == 'yes') {
            return "'1'";
        }
        else if (s === false || s == 'no') {
            return "'0'";
        }
        else {
            s = s === undefined ? '' : s;
            return "'" + addslashes(s) + "'";
        }
    }
});

decaf.extend(exports, {
    MySQL: MySQL
});