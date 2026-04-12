/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_drops000001")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.role ?= \"admin\" || token = @request.query.qtoken",
    "viewRule": "@request.auth.role ?= \"admin\" || token = @request.query.qtoken"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_drops000001")

  // update collection data
  unmarshal({
    "listRule": "id != \"\"",
    "viewRule": "id != \"\""
  }, collection)

  return app.save(collection)
})
