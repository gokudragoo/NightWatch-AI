import { MongoClient, type Collection } from "mongodb"
import type { NightWatchPersistenceState } from "./types"

type NightWatchPersistenceDocument = {
  wallet: string
  state: NightWatchPersistenceState
  createdAt: Date
  updatedAt: Date
}

type MongoCache = {
  client?: MongoClient
  promise?: Promise<MongoClient>
}

const globalForMongo = globalThis as typeof globalThis & {
  __nightwatchMongo?: MongoCache
  __nightwatchMongoIndexReady?: Promise<string>
}

function mongoCache() {
  if (!globalForMongo.__nightwatchMongo) {
    globalForMongo.__nightwatchMongo = {}
  }
  return globalForMongo.__nightwatchMongo
}

export function isPersistenceConfigured() {
  return Boolean(process.env.MONGODB_URI)
}

async function getMongoClient() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error("MONGODB_URI is not configured")
  }

  const cache = mongoCache()
  if (cache.client) return cache.client

  if (!cache.promise) {
    cache.promise = new MongoClient(uri, {
      appName: "nightwatch-ai",
      serverSelectionTimeoutMS: 5_000,
    }).connect()
  }

  cache.client = await cache.promise
  return cache.client
}

export async function getPersistenceCollection(): Promise<Collection<NightWatchPersistenceDocument>> {
  const client = await getMongoClient()
  const dbName = process.env.NIGHTWATCH_PERSISTENCE_DB || "nightwatchai"
  const collectionName = process.env.NIGHTWATCH_PERSISTENCE_COLLECTION || "wallet_profiles"
  const collection = client.db(dbName).collection<NightWatchPersistenceDocument>(collectionName)

  if (!globalForMongo.__nightwatchMongoIndexReady) {
    globalForMongo.__nightwatchMongoIndexReady = collection.createIndex({ wallet: 1 }, { unique: true })
  }
  await globalForMongo.__nightwatchMongoIndexReady

  return collection
}
