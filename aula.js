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
        if (msg.payload.dailyOverview && Object.keys(msg.payload.dailyOverview).length) {
          for (const child of Object.values(msg.payload.dailyOverview)) {
            if (child.error) throw new Error(child.error)
          }
        }
        if (msg.payload.messages && msg.payload.messages.length && msg.payload.messages[0].error) {
          throw new Error(msg.payload.messages[0].error)
        }
        if (msg.payload.calendar && msg.payload.calendar.length && msg.payload.calendar[0] === 'error') {
          throw new Error(msg.payload.calendar[1])
        }
        node.status({ fill: '', text: '' })
        send(msg)
        done()
      } catch (error) {
        try {
          await node.server.aulaClient.clearSession()
          node.info('clearing session')
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
