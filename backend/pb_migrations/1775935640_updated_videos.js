/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_videos00001")

  // update collection data
  unmarshal({
    "createRule": "",
    "deleteRule": "@request.auth.role ?= \"admin\"",
    "listRule": "@request.auth.role ?= \"admin\" || drop.token = @request.query.token",
    "updateRule": "@request.auth.role ?= \"admin\"",
    "viewRule": "@request.auth.role ?= \"admin\" || drop.token = @request.query.token"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_videos00001")

  // update collection data
  unmarshal({
    "createRule": null,
    "deleteRule": null,
    "listRule": null,
    "updateRule": null,
    "viewRule": null
  }, collection)

  return app.save(collection)
})
