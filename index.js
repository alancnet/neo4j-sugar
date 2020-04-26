const { nest, raw, join } = require('nest-literal')
let driver = null, neo4j = null
const isCypher = Symbol('is-cypher')

const setNeo4j = o => (neo4j = o)
const setDriver = o => (driver = o)

function cypher(callSite, ...substitutions) {
  const ret = nest(callSite, ...substitutions)
  ret[Symbol.iterator] = () => (function*() {
    const { callSite, substitutions } = ret
    const params = {}
    const op = new Map()
    let i = 1
    const paramSubs = substitutions.map((sub) => {
      if (!op.has(sub)) {
        op.set(sub, `p${i++}`)
      }
      const key = op.get(sub)
      params[key] = sub
      return `$${key}`
    })
    const cypher = nest(callSite, ...paramSubs).toString()
    yield cypher
    yield params
  })()

  ret.toString = () => {
    const { callSite, substitutions } = ret
    return String.raw(callSite, ...substitutions.map(x => x && x[isCypher] ? x.toString() : JSON.stringify(x)))
  }

  ret[isCypher] = true
  return ret
}

const criteria = obj => cypher`{${Object.keys(obj).map(key => cypher`${raw(key)}: ${obj}.${raw(key)}`).reduce(join.with(', '))}}`

const IDENTITY = Symbol('identity')
const LABELS = Symbol('labels')
const NODE = Symbol('node')
function Pojo(node) {
  if (node) {
    this[LABELS] = node.labels
    this[IDENTITY] = pojo(node.identity)
    this[NODE] = node
    for (const key in node.properties) {
      this[key] = pojo(node.properties[key])
    }
  }
}

const _types = {}
const type = (name) => {
  if (!_types[name]) {
    const Type = function(node) {
      Pojo.call(this, node)
    }
    Type.get = get.bind(Type, name)
    Type.find = find.bind(Type, name)
    Type.upsert = upsert.bind(Type, name)
    Type.set = set.bind(Type, name)
    Object.defineProperty(Type, 'name', {value: name})
    Type.prototype = Object.create(Pojo.prototype)
    Type.prototype.constructor = Type
    _types[name] = Type
  }
  return _types[name]
}

const pojo = (o) => {
  if (typeof o === 'object' && o[Symbol.iterator]) return Array.from(o).map(o => pojo(o))
  if (o === undefined || o === null) return o
  if (o instanceof neo4j.types.Integer) {
    if (o > neo4j.types.Integer.MAX_SAFE_VALUE || o < neo4j.types.Integer.MIN_SAFE_VALUE)
      return o.toString() // Countable digits should never get this large.
    else
      return o.toNumber()
  }
  if (o instanceof neo4j.types.Node) {
    const label = o.labels[0] || 'Anonymous'
    const Type = type(label)
    return new Type(o)
  }
  return o
}



const get = async (type, criteria) => {
  return await single`
    MATCH (r:${raw(type)} ${cypher.criteria(criteria)})
    RETURN r
  `
}

const find = async (type, criteria) => {
  return (await single`
    MATCH (r:${raw(type)} ${cypher.criteria(criteria)})
    RETURN r
  `).records.map(x => x.toObject())
}



const upsert = async (type, criteria, data) => {
  const obj = {...criteria, ...data}
  const code = cypher`
    MERGE (r:${raw(type)} ${cypher.criteria(criteria)})
    ON CREATE SET r += ${obj}, r.created = timestamp(), r.modified = timestamp()
    ON MATCH SET r += ${data}, r.modified = timestamp()
    RETURN r
  `
  return await single(code.callSite, ...code.substitutions)
}

const set = async (type, node, data) => {
  return await single`
    MATCH (n:${raw(type)})
    WHERE id(n) = ${node[IDENTITY]}
    SET n += ${data}, n.modified = timestamp()
    RETURN n
  `
}

const single = async (callSite, ...substitutions) => {
  const session = driver.session()
  try {
    const res = await session.run(...cypher(callSite, ...substitutions))
    if (res.records[0]) return pojo(res.records[0])[0]
    else return null
  } finally {
    session.close()
  }
}


module.exports = cypher
module.exports.criteria = criteria
module.exports.cypher = cypher
module.exports.nest = nest
module.exports.raw = raw
module.exports.join = join
module.exports.type = type
module.exports.pojo = pojo
module.exports.Pojo = Pojo
module.exports.setNeo4j = setNeo4j
module.exports.setDriver = setDriver
module.exports.get = get
module.exports.find = find
module.exports.upsert = upsert
module.exports.single = single


/*
CREATE CONSTRAINT on (p:Person)
ASSERT p.name is UNIQUE

Upsert:

  MATCH (a:Person)-[:DRIVES]->(c:Car)
  WHERE
    a.name='Ann'
  SET c += {brand: 'Volvo', model: 'V70'}
  RETURN c

Aggregation:

  MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
  RETURN p.name, count(*) as numberOfMovies

Return nodes for graphs, return node.field for tabular

Null:
null is stored as undefined

null = null is null, not true

Regular Expressions:
p.name ~= "K.+"

Integers:

use neo4j.int({ low: 1, high: 0}) to represent longs

*/