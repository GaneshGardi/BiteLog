
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import AppDialog, {
  type AppDialogButton,
  type AppDialogType,
} from "../components/AppDialog";

type AppDialogOptions = {
  type?: AppDialogType;
  cancelable?: boolean;
  onDismiss?: () => void;
};

type AppDialogState = {
  title: string;
  message?: string;
  type: AppDialogType;
  buttons: AppDialogButton[];
  cancelable: boolean;
  onDismiss?: () => void;
};

type AppDialogContextValue = {
  showDialog: (
    title: string,
    message?: string,
    buttons?: AppDialogButton[],
    options?: AppDialogOptions,
  ) => void;
};

const AppDialogContext =
  createContext<AppDialogContextValue | undefined>(undefined);

type AppDialogProviderProps = {
  children: ReactNode;
};

export function AppDialogProvider({
  children,
}: AppDialogProviderProps) {
  const [dialog, setDialog] = useState<AppDialogState | null>(null);

  const showDialog = useCallback(
    (
      title: string,
      message?: string,
      buttons?: AppDialogButton[],
      options: AppDialogOptions = {},
    ) => {
      setDialog({
        title,
        message,
        type: options.type ?? "info",
        buttons:
          buttons && buttons.length > 0
            ? buttons
            : [{ text: "OK" }],
        cancelable: options.cancelable ?? false,
        onDismiss: options.onDismiss,
      });
    },
    [],
  );

  const handleDismiss = useCallback(() => {
    const onDismiss = dialog?.onDismiss;

    setDialog(null);
    onDismiss?.();
  }, [dialog]);

  const handleButtonPress = useCallback(
    (button: AppDialogButton) => {
      setDialog(null);
      button.onPress?.();
    },
    [],
  );

  const contextValue = useMemo(
    () => ({ showDialog }),
    [showDialog],
  );

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}

      {dialog && (
        <AppDialog
          visible
          title={dialog.title}
          message={dialog.message}
          type={dialog.type}
          buttons={dialog.buttons}
          cancelable={dialog.cancelable}
          onDismiss={handleDismiss}
          onButtonPress={handleButtonPress}
        />
      )}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);

  if (!context) {
    throw new Error(
      "useAppDialog must be used inside AppDialogProvider.",
    );
  }

  return context;
}
