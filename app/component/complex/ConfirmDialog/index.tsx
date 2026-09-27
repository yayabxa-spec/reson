import WeChatDialog from "../../base/WeChatDialog";

/**
 * 统一确认弹窗：委托给 WeChatDialog（随皮肤自适应原生 Material / 微信风格）。
 * 保留旧版行为：危险色确认按钮 + 2 秒倒计时。
 */
const ConfirmDialog = ({
  visible,
  title = "确认操作",
  message = "",
  confirmText = "确认删除",
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <WeChatDialog
    visible={visible}
    title={title}
    message={message}
    confirmText={confirmText}
    cancelText="取消"
    danger
    countdown={2}
    onConfirm={onConfirm}
    onCancel={onCancel}
  />
);

export default ConfirmDialog;