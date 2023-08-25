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
    node.on('input', async function (msg, send, done) {
      node.server = RED.nodes.getNode(config.server)
      try {
        node.status({ fill: '', text: 'Requesting data' })
        await node.server.aulaClient.updateData({ updateDailyOverview: config.getDailyOverview, updateMessage: config.getMessages, updateCalendar: config.getCalendar })
        msg.payload = JSON.parse(JSON.stringify(node.server.aulaClient))
        node.status({ fill: '', text: '' })
        send(msg)
        done()
      } catch (error) {
        node.status({ fill: 'red', text: error.message || error })
        done(error.message || error)
      }
    })
  }
  RED.nodes.registerType('aulaNode', AulaNode)
}
