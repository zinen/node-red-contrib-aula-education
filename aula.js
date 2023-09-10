module.exports = function (RED) {
  'use strict'
  const AulaClient = require('./aula-client.js')
  const Path = require('path')
  function AulaNodeConfigNode (n) {
    RED.nodes.createNode(this, n)
    const node = this
    try {
      node.aulaClient = new AulaClient({
        username: n.username,
        password: node.credentials.password,
        cookieStore: Path.join(__dirname, '.cookies' + node.id + '.json')
      })
    } catch (error) {
      node.error('Aula config error: ' + error.message || error)
    }
    this.on('close', async function (removed, done) {
      // This node is being restarted or disabled/deleted
      try {
        if (removed) {
          // This node has been disabled/deleted
          if (node.aulaClient) node.aulaClient.clearSession()
        }
      } catch (_) { }
      done()
    })
  }
  RED.nodes.registerType('aulaNode-config', AulaNodeConfigNode, {
    credentials: {
      password: { type: 'password' }
    }
  })
  function AulaNode (config) {
    RED.nodes.createNode(this, config)
    const node = this
    this.config = config
    node.on('input', async function (msg, send, done) {
      node.server = RED.nodes.getNode(config.server)
      try {
        node.status({ fill: '', text: 'Requesting data' })
        if (!node.config.outputChoice || node.config.outputChoice === 'getDailyOverview') {
          msg.payload = await node.server.aulaClient.getDailyOverview()
        } else if (node.config.outputChoice === 'getCalender') {
          msg.payload = await node.server.aulaClient.getCalender()
        } else if (node.config.outputChoice === 'getMessages') {
          msg.payload = await node.server.aulaClient.getMessages()
        } else if (node.config.outputChoice === 'getPosts') {
          msg.payload = await node.server.aulaClient.getPosts()
        } else if (node.config.outputChoice === 'getNotifications') {
          msg.payload = await node.server.aulaClient.getNotifications()
        } else {
          throw new Error('Error understanding configured output choice')
        }
        node.status({ fill: '', text: '' })
        send(msg)
        done()
      } catch (error) {
        try {
          await node.server.aulaClient.clearSession()
          node.debug('clearing session')
        } catch (error) {
          node.warn(error)
        }
        node.status({ fill: 'red', text: error.message || error })
        done(error.message || error)
      }
    })
  }
  RED.nodes.registerType('aulaNode', AulaNode)
}
