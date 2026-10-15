/**
 * SensorProbe —— 空壳占位脚本（无逻辑）。
 *
 * 背景：该脚本早期用于探测陀螺仪 / 传感器 API。2026-10-14 已用运行期探测实测确认：
 *       APJS 用户脚本层**不存在任何设备姿态 / 高度传感器**
 *       （GyroSensorAgent / RotationSensorAgent / AccelerometerAgent / Gyroscope /
 *        SensorAgent / buildGyroSensorAgent 全部 undefined；DeviceTracker 组件仅剩
 *        _rtti/_typedRtti 内部字段；AlgorithmManager.getSlamInfo 亦为 undefined）。
 *       → 「下蹲改变高度躲避火球」在引擎层面不可实现。
 *
 * 为什么保留：像塑编辑器的编译节点把「用户脚本清单」缓存在内存里，删除磁盘文件不会
 *       同步该清单，导致 "compile Scripts" 阶段报
 *       ENOENT ... Out/Scripts/SensorProbe.js 并阻断运行时打包。
 *       保留一个可编译的空壳即可让该阶段恢复正常。
 *
 * 清理方式：编辑器重启后，引擎内存清单会按盘上文件重建，届时可用 delete_script 移除。
 */
@component()
export class SensorProbe extends APJS.BasicScriptComponent {
  onStart(): void {
    // 空壳，无逻辑
  }
}
