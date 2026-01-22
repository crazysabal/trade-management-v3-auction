# Changelog

All notable changes to this project will be documented in this file.

## [1.0.6] - 2026-01-22

### Added
- **Auction Statement**: Added "낙찰 명세서" menu item under "Auction Management" to view external auction results (`tgjungang.co.kr`).
- **Real-time Product Sync**: Implemented `PRODUCT_DATA_CHANGED` event system. Modifications in `ProductManager` now instantly refresh `AuctionImportV2` and `TradePanel`.

### Changed
- **Auction Import**: "Register Purchase" button now correctly identifies pending items and displays "모두 완료됨" (All Completed) when finished.
- **Auction Import**: Enhanced "Reset Status" button styling for better visibility.
- **UI Cleanup**: Removed redundant "Refresh Products" buttons from `TradePanel` and `AuctionImportV2` as auto-sync is now active.

### Fixed
- **TradePanel**: Resolved `ReferenceError` where `fetchBaseData` was called before initialization.
- **Performance**: Optimized re-rendering in `AuctionImportV2` using `useMemo` for mapping logic.

## [1.0.5] - 2026-01-21
- **Auction Account Management**: Fixes for account deletion and session cleanup.
- **System Stability**: Database schema synchronization and parity checks.
