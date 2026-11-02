const Warehouse = require('../models/Resources/wareHouse');
const Storage = require('../models/Resources/storageModel');
const mongoose = require('mongoose');

/**
 * Calculates current allocated volume in a warehouse
 * @param {string|ObjectId} warehouseId
 * @param {string|ObjectId|null} excludeStorageId - Storage ID to exclude (e.g. for updates)
 * @returns {Promise<{ allocatedM3: number, occupiedM3: number, storageCount: number, occupiedCount: number }>}
 */
async function calculateWarehouseAllocation(warehouseId, excludeStorageId = null) {
  if (!warehouseId || !mongoose.Types.ObjectId.isValid(warehouseId)) {
    return { allocatedM3: 0, occupiedM3: 0, storageCount: 0, occupiedCount: 0 };
  }

  const query = {
    warehouse: new mongoose.Types.ObjectId(warehouseId),
    deleted: { $ne: true },
    storageStatus: { $ne: 'deleted' }
  };

  if (excludeStorageId && mongoose.Types.ObjectId.isValid(excludeStorageId)) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeStorageId) };
  }

  const storages = await Storage.find(query).lean();

  let allocatedM3 = 0;
  let occupiedM3 = 0;
  let storageCount = storages.length;
  let occupiedCount = 0;

  for (const st of storages) {
    const vol = Number(st.cubicMeter) || 0;
    allocatedM3 += vol;
    if (st.storageStatus === 'In use' || st.storageStatus === 'occupied') {
      occupiedM3 += vol;
      occupiedCount++;
    }
  }

  return {
    allocatedM3: Math.round(allocatedM3 * 100) / 100,
    occupiedM3: Math.round(occupiedM3 * 100) / 100,
    storageCount,
    occupiedCount
  };
}

/**
 * Validates whether adding or modifying storage volume in a warehouse complies with the 120% capacity limit
 * @param {string|ObjectId} warehouseId
 * @param {number} additionalM3
 * @param {string|ObjectId|null} excludeStorageId
 * @returns {Promise<{ valid: boolean, code?: string, message?: string, details?: object }>}
 */
async function validateWarehouseCapacity(warehouseId, additionalM3, excludeStorageId = null) {
  const volToAdd = Number(additionalM3);
  if (isNaN(volToAdd) || volToAdd <= 0) {
    return {
      valid: false,
      code: 'INVALID_STORAGE_VOLUME',
      message: 'Storage volume (cubicMeter) must be a positive number greater than 0.'
    };
  }

  if (!warehouseId || !mongoose.Types.ObjectId.isValid(warehouseId)) {
    // If no warehouse specified, storage isn't bound to warehouse limits
    return { valid: true, isUnassigned: true };
  }

  const warehouse = await Warehouse.findById(warehouseId).lean();
  if (!warehouse) {
    return {
      valid: false,
      code: 'WAREHOUSE_NOT_FOUND',
      message: `Warehouse with ID ${warehouseId} does not exist.`
    };
  }

  const ratedCapacity = Number(warehouse.totalCapacityM3) || 0;
  // If warehouse has no rated capacity set (0 or undefined), it is unconstrained (backward compatibility)
  if (ratedCapacity <= 0) {
    return {
      valid: true,
      warehouseName: warehouse.name,
      ratedCapacity: 0,
      isUnconstrained: true
    };
  }

  // 120% capacity limit (allowing 20% operational/overflow buffer)
  const maxAllowedM3 = Math.round(ratedCapacity * 1.20 * 100) / 100;

  const { allocatedM3 } = await calculateWarehouseAllocation(warehouseId, excludeStorageId);
  const projectedTotal = Math.round((allocatedM3 + volToAdd) * 100) / 100;

  if (projectedTotal > maxAllowedM3) {
    const excess = Math.round((projectedTotal - maxAllowedM3) * 100) / 100;
    return {
      valid: false,
      code: 'WAREHOUSE_CAPACITY_EXCEEDED',
      message: `Warehouse capacity exceeded for '${warehouse.name}'. Rated capacity: ${ratedCapacity} m³, 120% limit: ${maxAllowedM3} m³. Current allocation: ${allocatedM3} m³. Attempted addition: ${volToAdd} m³ (Projected total: ${projectedTotal} m³ exceeds limit by ${excess} m³).`,
      details: {
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        ratedCapacity,
        maxAllowedM3,
        currentAllocatedM3: allocatedM3,
        attemptedAdditionM3: volToAdd,
        projectedTotalM3: projectedTotal,
        excessM3: excess
      }
    };
  }

  const remainingBefore120 = Math.round((maxAllowedM3 - projectedTotal) * 100) / 100;
  return {
    valid: true,
    warehouseId: warehouse._id,
    warehouseName: warehouse.name,
    ratedCapacity,
    maxAllowedM3,
    currentAllocatedM3: allocatedM3,
    projectedTotalM3: projectedTotal,
    remainingM3: remainingBefore120
  };
}

module.exports = {
  calculateWarehouseAllocation,
  validateWarehouseCapacity
};

