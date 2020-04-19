const { nest, raw } = require('nest-literal')
const neo4j = require('neo4j-driver')

function cypher(callSite, ...substitutions) {
  const ret = nest(callSite, ...substitutions)
  ret[Symbol.iterator] = () => (function*() {
    const params = {}
    const paramSubs = ret.substitutions.map((sub, i) => {
      const key = `p${i}`
      params[key] = sub
      return `$${key}`
    })
    const cypher = nest(callSite, ...paramSubs).toString()
    yield cypher
    yield params
  })()
  return ret
}

neo4j.default.cypher = cypher
module.exports = neo4j
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