# neo4j-sugar

Adds the power of string templates to neo4j driver. 

### Usage:

```javascript
import neo4j from 'neo4j-neo4j'
import { cypher } from 'neo4j-sugar'

...

const user = {
  name: 'Sally',
  email: 'sally@example.com',
  username: 'sally-sugar'
}

session.run(...cypher`
  MATCH (p:Person {email: ${user.email}})
  SET p += ${user}
  RETURN user
`)

```

### How does it work?

`cypher` is a string template function. It returns an iterable object that yields two values:
The final Cypher code, with all substitutions replaced with `$p0`, `$p1`, etc., and a params
object (`{ p0: 'sally@example.com', { name: 'Sally', ... }}`). The spread operator (`...`)
spreads the two values as parameters to the function call to `session.run`. 

_Ultimately_, the above code is equivalent to this:

```javascript
session.run(
  `
    MATCH (p:Person {email: $p0})
    SET p += $p1
    RETURN user
  `,
  {
    p0: 'sally@example.com',
    p1: { name: 'Sally', email: 'sally@example.com', username: 'sally-sugar' }
  }
)
```