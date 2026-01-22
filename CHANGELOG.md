# Changelog

All notable changes to this project will be documented in this file.

## [1.0.17] - 2026-01-22

### Changed
- **Inventory Quick Split**: The sorting order of the "Result Product" selection in the stock split modal has been improved. It now prioritizes the database `sort_order` first, followed by weight (descending), making it easier to select common target products.

## [1.0.16] - 2026-01-22

### Added
- **Zero-Touch Automated Migration**: Added a server-side migration system that automatically updates database triggers and performs a "Hard Sync" of inventory data upon server start. No manual script execution is required by the user.

### Fixed
- **Inventory Recovery**: Implemented a mandatory global data synchronization during updates to fix corrupted inventory aggregate values caused by previous version bugs. This ensures "Insufficient Stock" errors are resolved for existing data.
- **Triggers**: Finalized inventory triggers to maintain data integrity during trade updates.

## [1.0.11] - 2026-01-22

### Fixed
- **Setup Stability**: Enhanced `master_setup.js` to automatically enforce inventory trigger synchronization during updates.
- **Inventory Sync**: Fixed critical "Insufficient Stock" error during trade updates by ensuring aggregate inventory restoration.

## [1.0.10] - 2026-01-22

### Fixed
- **Inventory Sync**: Fixed a critical issue where aggregate inventory was not restored when deleting or updating a trade detail. This prevents the "Insufficient Stock" error during trade updates.
- **Navbar UI**: Refined mobile layout to position the logout button next to user info for better space efficiency.

## [1.0.8] - 2026-01-22

### Added
- **Auction Statement**: Added "낙찰 명세서" menu item under "Auction Management" to view external auction results (`tgjungang.co.kr`).
- **Real-time Product Sync**: Implemented `PRODUCT_DATA_CHANGED` event system. Modifications in `ProductManager` now instantly refresh `AuctionImportV2` and `TradePanel`.
- **Stock Recalculation**: Added a "재고 복구 (Sync)" button in `InventoryList` to fix discrepancies between aggregate inventory and lot-based stock.

### Changed
- **Auction Import**: "Register Purchase" button now correctly identifies pending items and displays "모두 완료됨" (All Completed) when finished.
- **Auction Import**: Enhanced "Reset Status" button styling for better visibility.
- **UI Cleanup**: Removed redundant "Refresh Products" buttons from `TradePanel` and `AuctionImportV2` as auto-sync is now active.

### Fixed
- **TradePanel**: Resolved `ReferenceError` where `fetchBaseData` was called before initialization.
- **Performance**: Optimized re-rendering in `AuctionImportV2` using `useMemo` for mapping logic.
- **Critical Bug Fix**: Resolved "Insufficient Inventory" error during sales of split/produced items. Added manual synchronization to `inventory` aggregate table for "PRODUCTION" events, as the database trigger previously ignored them.

## [1.0.5] - 2026-01-21
- **Auction Account Management**: Fixes for account deletion and session cleanup.
- **System Stability**: Database schema synchronization and parity checks.
