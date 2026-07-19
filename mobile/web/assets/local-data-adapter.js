import { beerRepository } from "./beer-repository.js";
import { tastingRepository } from "./tasting-repository.js";
import { tagRepository } from "./tag-repository.js";
import { photoRepository } from "./photo-repository.js";
import { statsRepository } from "./stats-repository.js";
import { backupService } from "./backup-service.js";

/**
 * The presentation layer talks to this boundary instead of knowing SQLite
 * table names or calling repositories directly.  The methods deliberately
 * preserve the existing repository contracts so the UI migration cannot
 * change Schema 4 semantics.
 */
export const localDataAdapter = {
  listBeers: (...args) => beerRepository.listBeers(...args),
  getBeer: (id) => beerRepository.getBeerById(id),
  getBeerById: (id) => beerRepository.getBeerById(id),
  createBeer: (data) => beerRepository.createBeer(data),
  updateBeer: (id, data) => beerRepository.updateBeer(id, data),
  deleteBeer: (id) => beerRepository.softDeleteBeer(id),
  softDeleteBeer: (id) => beerRepository.softDeleteBeer(id),
  restoreBeer: (id) => beerRepository.restoreBeer(id),
  listDeletedBeers: () => beerRepository.listDeletedBeers(),
  listTastings: (...args) => tastingRepository.listTastings(...args),
  listTastingsByBeerId: (id) => tastingRepository.listTastingsByBeerId(id),
  getTasting: (id) => tastingRepository.getTastingById(id),
  getTastingById: (id) => tastingRepository.getTastingById(id),
  createTasting: (data) => tastingRepository.createTasting(data),
  updateTasting: (id, data) => tastingRepository.updateTasting(id, data),
  deleteTasting: (id) => tastingRepository.softDeleteTasting(id),
  softDeleteTasting: (id) => tastingRepository.softDeleteTasting(id),
  restoreTasting: (id) => tastingRepository.restoreTasting(id),
  listDeletedTastings: () => tastingRepository.listDeletedTastings(),
  listTags: (...args) => tagRepository.listTags(...args),
  searchTags: (...args) => tagRepository.searchTags(...args),
  setBeerTags: (...args) => tagRepository.setBeerTags(...args),
  listAvailableFilterTags: () => tagRepository.listAvailableFilterTags(),
  searchBeers: (...args) => beerRepository.searchBeers(...args),
  filterBeers: (...args) => beerRepository.listBeers(...args),
  sortBeers: (...args) => beerRepository.listBeers(...args),
  getStatistics: (...args) => statsRepository.getDashboard(...args),
  getDashboard: (...args) => statsRepository.getDashboard(...args),
  getTastingStats: (...args) => tastingRepository.getStats(...args),
  getStats: (...args) => tastingRepository.getStats(...args),
  getBeerTastingStats: (...args) => tastingRepository.getStatsByBeerId(...args),
  getStatsByBeerId: (...args) => tastingRepository.getStatsByBeerId(...args),
  addBeerPhotos: (data) => photoRepository.addPhoto(data),
  addTastingPhotos: (data) => photoRepository.addPhoto(data),
  addPhoto: (data) => photoRepository.addPhoto(data),
  preparePhoto: (source) => photoRepository.preparePhoto(source),
  listForOwner: (type, id) => photoRepository.listForOwner(type, id),
  readDataUrl: (path) => photoRepository.readDataUrl(path),
  takePhoto: () => photoRepository.takePhoto(),
  selectBeerPhotos: (id) => photoRepository.listForOwner("beer", id),
  selectTastingPhotos: (id) => photoRepository.listForOwner("tasting", id),
  deletePhoto: (id) => photoRepository.softDeletePhoto(id),
  restorePhoto: (id) => photoRepository.restorePhoto(id),
  setCoverPhoto: (...args) => photoRepository.setCover(...args),
  setCover: (...args) => photoRepository.setCover(...args),
  listDeletedPhotos: () => photoRepository.listDeletedPhotos(),
  exportBackup: () => backupService.exportBackup(),
  downloadBackup: () => backupService.downloadBackup(),
  importBackup: (backup) => backupService.importBackup(backup),
  importBackupFile: (file) => backupService.importFile(file),
  importFile: (file) => backupService.importFile(file),
  clearData: () => backupService.clearAll(),
  clearAll: () => backupService.clearAll(),
};
