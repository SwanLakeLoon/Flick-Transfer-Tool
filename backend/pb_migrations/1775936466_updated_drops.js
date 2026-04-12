/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_drops000001")

  // update collection data
  unmarshal({
    "listRule": "",
    "viewRule": ""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_drops000001")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.role ?= \"admin\" || token = @request.query.token",
    "viewRule": "@request.auth.role ?= \"admin\" || token = @request.query.token"
  }, collection)

  return app.save(collection)
})
