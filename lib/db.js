'use strict'

const r = require('rethinkdb')
const co = require('co')
const Promise = require('bluebird')
const utils = require('./utils')
const uuid = require('uuid-base62')

const defaults = {
  host: 'localhost',
  port: 28015,
  db: 'platzigram'
}

class Db {
  /**
   * [constructor description]
   * @param  {[type]} options [description]
   * @return {[type]}         [description]
   */
  constructor (options) {
    options = options || {}
    this.host = options.host || defaults.host
    this.port = options.port || defaults.port
    this.db = options.db || defaults.db
  }

  /**
   * [connect description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  connect (callback) {
    this.connection = r.connect({
      host: this.host,
      port: this.port
    })

    this.connected = true

    let connection = this.connection
    let db = this.db

    let setup = co.wrap(function * () {
      let conn = yield connection

      let dbList = yield r.dbList().run(conn)
      if (dbList.indexOf(db) === -1) {
        yield r.dbCreate(db).run(conn)
      }

      let dbTables = yield r.db(db).tableList().run(conn)
      if (dbTables.indexOf('images') === -1) {
        yield r.db(db).tableCreate('images').run(conn)
        yield r.db(db).table('images').indexCreate('createdAt').run(conn)
      }

      if (dbTables.indexOf('users') === -1) {
        yield r.db(db).tableCreate('users').run(conn)
      }

      return conn
    })

    return Promise.resolve(setup()).asCallback(callback)
  }

  /**
   * [disconnect description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  disconnect (callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    this.connected = false
    return Promise.resolve(this.connection)
      .then((conn) => conn.close())
  }

  /**
   * [saveImage description]
   * @param  {[type]}   image    [description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  saveImage (image, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let tasks = co.wrap(function * () {
      let conn = yield connection
      image.createdAt = new Date()
      image.tags = utils.extractTags(image.description)

      let result = yield r.db(db).table('images').insert(image).run(conn)

      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      image.id = result.generated_keys[0]

      yield r.db(db).table('images').get(image.id).update({
        public_id: uuid.encode(image.id)
      }).run(conn)

      let created = yield r.db(db).table('images').get(image.id).run(conn)
      return Promise.resolve(created)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  /**
   * [likeImage description]
   * @param  {[type]}   id       [description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  likeImage (id, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let imageId = uuid.decode(id)

    let tasks = co.wrap(function * () {
      let conn = yield connection
      let image = yield r.db(db).table('images').get(imageId).run(conn)
      yield r.db(db).table('images').get(imageId).update({
        liked: true,
        likes: image.likes + 1
      }).run(conn)

      let created = yield r.db(db).table('images').get(imageId).run(conn)

      return Promise.resolve(created)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  /**
   * [getImage description]
   * @param  {[type]} id [description]
   * @return {[type]}    [description]
   */
  getImage (id, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let imageId = uuid.decode(id)

    let tasks = co.wrap(function * () {
      let conn = yield connection
      let result = yield r.db(db).table('images').get(imageId).run(conn)
      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  /**
   * [getImage description]
   * @param  {[type]} id [description]
   * @return {[type]}    [description]
   */
  getImages (callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let images = yield r.db(db).table('images').orderBy({
        index: r.desc('createdAt')
      }).run(conn)

      let result = yield images.toArray()

      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }

  saveUser (user, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection

      user.password = utils.encrypt(user.password)
      user.createdAt = new Date()

      let result = yield r.db(db).table('users').insert(user).run(conn)

      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }

      user.id = result.generated_keys[0]

      let created = yield r.db(db).table('users').get(user.id).run(conn)

      return Promise.resolve(created)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }
}

module.exports = Db
