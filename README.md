# Graph-Queries
Tools for mapping a webgme project into a graph-database (currently orientDB). 

### Mapping example

#### Example project in webgme
From left to right: Meta-Model, Composition (of "aDiagram"), Set-Editor (of "aDiagram"), Composition-Tree, Inheritance-Tree.
![WebGME Model](img/FSM_webgme.png "Finite state-machine in webgme. From left to right, Meta-Model, Composition, SetEditor, Composition-Tree, Inheritance-Tree")

#### Example project as mapped to graphDB
Meta nodes has a "meta" relation to themselves (not visualized in graph).
![GraphDB Model](img/FSM_graphDB.png "Finite state-machine project mapped to graphDB.")
