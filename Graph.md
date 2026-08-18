---
title: Graph
created_at: 2026-07-01 22:07
last_updated_at: 2026-07-01T10:07:17+05:30
type: note
status: draft
tags:
  - dsa
  - graphs
aliases:
summary:
---
## Graph 

Graph is non linear data structure consists of the node( vertices ) and edges.

> Tree are special case of the graph where tree are called as `DAG` ( directed acrylic graph )



### how to represent the Graph 

#### Adjancy matrix : 

take example of `A-b and B-C`

> Directed Graph
``` 
for directed grapgh meaing A->B but B -> X A
  A B C
A 0 1 0
B 1 0 1
C 0 1 0
```

> `Undirected` Graph

``` 
for directed grapgh meaing A->B but B -> X A
  A B C
A 0 1 0
B 0 0 1
C 0 0 0
```


#### Adjacency  List 

- represented by hashmap we can simple sore the neighbour of the each node in the key value pairs 

```
undirected 
{
	A : [ B] ,
	B : [ A , C]
	C : [ b]
}
```

```
directed 
{
	A : [ B ] ,
	B : [ C ]
	C : [ ]
}
```

How to Create Adjancey List from given matrix 
```python 
def getNeighbours(node_index):
	return [ i,r for in range(graph[node_index]) if x]
```


> [[Max Area of Island#when to upward passing and downward passing | Intuition for how iterate in Graph]]
