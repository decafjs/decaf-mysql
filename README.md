MySQL JDBC DRIVER REQUIRED
==========================

The Decaf JavaScript interface to MySQL requires the MySQL JDBC driver be installed on your system.

You can download the driver from this URL:
    http://dev.mysql.com/downloads/connector/j/

The driver is GPL licensed, so including it as part of the base Decaf distribution would make it and
anything built with or for it fall under the GPL license as well.

It is up to you to obtain appropriate licensing from Oracle/MySQL for your needs.

Once you download the driver, copy the .jar file to the appropriate place for your operating system.
For OSX it is:

/System/Library/Java/Extensions/

Or you may add it to the java/ext dir in /usr/local/decaf or wherever your Decaf is installed.

## Schema (ORM)

Also see:

 - http://dailyjs.com/2011/12/19/silkjs-extjs/


### Use

```javascript

var Schema = require('decaf-mysql').Schema;

Schema.version = 'v1.0';
Schema.add({
    name: 'Users',
    fields: [
        // note that all tables should have unique field names if you want to join queries!
        // so id has been changed to user_id
        { name: 'user_id', type 'int', autoIncrement: true },
        { name: 'email', type: 'varchar', size: 100, defaultValue: 'me@nowhere.com' },
        { name: 'username', type: 'varchar', size: 100 },
        { name: 'password', type: 'varchar', size: 255, serverOnly: true },
        { mame: 'role', type: 'varchar', size: 100 },
        { name: 'location', type: 'varchar', size: 100 },
        { name: 'confirmed', type: 'tinyint', defaultValue: 0 },
        { name: 'createdDate', type: 'int', defaultValue: function() { return parseInt(new Date().getTime()/1000, 10); }},
        { name: 'timestamp', type: 'int', defaultValue: function() { return parseInt(new Date().getTime()/1000, 10) }}
    ],
    primaryKey: 'user_id',
    // since we're going to look up users by email or username, let's have indexes for those columns
    indexes: [
        'email',
        'username'
    ],
    // onCreate is only called IF the table is created
    // not called if it already exists
    onCreate: function() {
        // note that you don't have to have values for every field, the record will have defaultValue set
        // for any not provided, or suitable default if no defaultValue for the field is defined.
        Schema.putOne('Users', {
            email: 'jay@moduscreate.com',
            username: 'jay',
            password: 'whatever_password_you_want',
            role: 'Administrator',
            location: 'Modus HQ',
            confirmed: true
        });
        console.log('table created, record added');
    },
    // onLoad is called for each record returned
    // it is called on all records in the array returned by Schema.find() as well
    onLoad: function(record) {
        // we convert the integer UNIX style timestamps into JavaScript dates
        record.createdDate = new Date(record.createdDate*1000);
        record.timestamp = new Date(record.timestamp * 1000);
    },
    // onPut is called for each record that is about to be stored in the database
    onPut: function(record) {
        // here we convert JavaScript date back to UNIX timestamp
        record.createdDate = parseInt(record.createdDate/1000, 10);
        record.timestamp = parseInt(record.timestamp/1000, 10);
    }
});

// The onLoad and onPut are just to illustrate the functionality, we'd probably just use the timestamp integer
// values.  Another typical use is to convert a text field from JSON to an object and vice versa.

// onCreate is called after all the Schema.add() are done, so you don't have to worry about the order of
// table creation.

// The password field has serverOnly: true attribute.  This is a hint that the field should not be sent to the client.
// You can "cleanse" an object using Schema.clean():

var userRecord = Schema.findOne('users', { username: 'jay' });
userRecord = userRecord.clean('Users', userRecord);
// userRecord has its serverOnly (thus password) field(s) removed


// The really neat thing about Schema is you can edit the above Schema.add fields, indexes, etc., all you want.
// Add fields, rename fields, add indexes, remove inedexes, whatever.
// Next time you run the program, which calls Schema.add(), the Schema will perform all the appropriate
// ALTER TABLE commands to assure the database table matches the Schema definition.

// Let's work with a 2nd table, too.

Schema.add({
    name: 'Organizations',
    fields: [
        // note that all tables should have unique field names if you want to join queries!
        // so id has been changed to organization_id
        { name: 'organization_id', type: 'int', autoIncrement: true },
        { name: 'user_id', type: 'int' },
        { name: 'name', type: 'varchar', size: 100 },
        { name: 'owner', type: 'varchar', size: 100 }
    ],
    primarykey: 'organization_id',
    onCreate: function() {
        var userRecord = Schema.findOne('Users', { username: 'jay'}) || Schema.putOne('Users', {
            email: 'jay@moduscreate.com',
            username: 'jay',
            password: 'whatever_password_you_want',
            role: 'Administrator',
            location: 'Modus HQ',
            confirmed: true
        });
        Schema.putOne('Organizations', {
            user_id: userRecord.user_id,
            name: 'Modus Create',
            owner: 'Jay Garcia'
        });
        console.log("Organizations table created, record(s) inserted");
    }
});

// Join queries can be done two ways:
var record = SQL.getDataRow("SELECT * FROM Users,Organizations WHERE username='jay' AND Organizations.user_id = Users.user_id");
// or
var user = Schema.findOne('Users', { username: 'jay' }) || {},
    organization = user.user_id ? Schema.findOne('Organizations', { user_id: user.user_id }) : {},
    record = decaf.extend(user, organization);

// A record might be joined fields from two tables.  It's easy to store the recrod back to the two tables.
// Here we use a MySQL transaction to assure both table records get written, to avoid corruption of the DB:
SQL.startTransaction();
try {
    Schema.putOne('Users', record);
    Schema.putOne('Organizations', record);
    SQL.commit();
}
catch (e) {
    SQL.rollback();
    console.log('SQL ERROR!');
    console.log(e.message);
}

// find queries are done by example
// you supply an example object containing zero or more field values that you want records for.
// Both these return the same record:
user = Schema.findOne('Users', { username: 'jay' });
user = Schema.findOne('Users', { email: 'jay@moduscreate.com' });
// you can do "like" queries, too:
modusEmployees = Schema.find('Users', { email: '%@moduscreate.com' });  // % is wildcard

// Schema is great for 99% of your queries.  When you need to do complex queries that don't fit the query by
// example scheme, you will be generating MySQL queries directly via SQL.getDataRow() or SQL.getDataRows().
// Schema does help quite a bit with it's where() method.  It returns an array of variable=value values,
// suitable for the WHERE clause in a query.
var where = Schema.where('Users', { username; 'jay', });
// => [ "Users.username='jay'" ]
var where = Schema.where('Users', { username: 'jay', email: '%@moduscreate.com' });
// => [ "Users.username='jay'", "Users.email like '%@moduscreate.com" ]
var where = Schema.where('Users', { username: 'jay' }).concat(Schema.where('Organizations', { name: '%odus%' }));
// => [ "Users.username='jay'", "Organizations.name like '%odus%" ]

// using that last where array:
var records = SQL.getDataRows("SELECT * FROM Users,Organizations WHERE " + where.join(' AND ') + " AND Organizations.user_id=Users.userId");

// Other useful tips:
var numUsers = Schema.count('Users', { email: '%@moduscreate.com' });
// returns # of users with @moduscreate.com email address

// create a new record with default values (it is not in the database until you store it):
var newRecord = Schema.newRecord('Users');
// create a new record with all default values except for username
var newRecord = Schema.newRecord('Users', { username: 'jay' });

//
// Inheritance
//

// example base class
Schema.define({
    name: 'Base',
    fields: [
        { name: 'created', type: 'int' },
        { name: 'edited', type: 'int' }
    ]
});

// inherit from Base class
Schema.extend('Base', {
    name: 'SubClass1',
    fields: [
        { name: 'subClass1_id', type: 'int', autoIncrement: true }
    ]
});

// inherit a second from Base class
Schema.extend('Base', {
    name: 'SubClass2',
    fields: [
        { name: 'subClass2_id', type: 'int', autoIncrement: true }
    ]
});
// both SubClass1 and SubClass2 have created and edited fields in their tables
```

Schema provides two members, ```version``` and ```lastvVersion``` that are arbitrary strings.  The ```version``` member is set to 'v1' by default.  You may set it to anything you like, and likely will bump the version when you edit the schemas to make changes.  The ```lastVersion``` member is the value of the schema in the database at startup time before any changes are applied.  You may compare ```version``` to ```lastVersion``` to apply database migrations.


Schema is observable.  It fires the following events:

- beforeChange - before a schema change causes alter table statements to be executed.
- afterChange - after a schema change has caused alter table statements to be executed.

The handlers for these events are passed the schema that is about to or just has been altered.

Additionally, a 'ready' event is fired after the schemas have all been processed (altered, created, onCreate called).

