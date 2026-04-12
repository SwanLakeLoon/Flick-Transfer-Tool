/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_drops000001")

  // update collection data
  unmarshal({
    "createRule": ""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_drops000001")

  // update collection data
  unmarshal({
    "createRule": "id != \"\""
  }, collection)

  return app.save(collection)
})
