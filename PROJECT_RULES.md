# GAS_Projects Project Rules

This file documents the core rules and configurations for this project.

## 1. General Rules
- **Language**: All AI (Agent) communication must be in **Japanese**.

## 2. Stock Manager (2_Stock_Manager) Logic Rules
- **Shipment Handling (出荷の扱い)**:
  - Messages containing "出荷" (Shipment), "持っていった" (Carried), etc., are treated as **Inventory Replenishment/Addition**.
  - Example: "みどりの大地にじゃがいも30個出荷" -> Adds 30 to "みどりの大地" potato stock.
- **Reporting**:
  - Sales reports retrieved from Gmail are automatically forwarded to LINE.
  - Inventory updates via chat are reported back to LINE.
