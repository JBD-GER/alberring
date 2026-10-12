package de.alberring.nativebuild;

import com.android.build.api.instrumentation.AsmClassVisitorFactory;
import com.android.build.api.instrumentation.ClassContext;
import com.android.build.api.instrumentation.ClassData;
import com.android.build.api.instrumentation.InstrumentationParameters;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

/** Compatibility fix for the two Window color reads in ioncamera-android 1.0.2. */
public abstract class CameraEdgeToEdgeFix implements AsmClassVisitorFactory<InstrumentationParameters.None> {
    private static final String ACTIVITY = "io.ionic.libs.ioncameralib.view.IONCAMRImageEditorActivity";

    @Override public boolean isInstrumentable(ClassData data) {
        return ACTIVITY.equals(data.getClassName());
    }

    @Override public ClassVisitor createClassVisitor(ClassContext context, ClassVisitor next) {
        return patch(next);
    }

    static ClassVisitor patch(ClassVisitor next) {
        return new ClassVisitor(Opcodes.ASM9, next) {
            private int statusReads;
            private int navigationReads;

            @Override public MethodVisitor visitMethod(int access, String name, String descriptor,
                    String signature, String[] exceptions) {
                MethodVisitor nextMethod = super.visitMethod(access, name, descriptor, signature, exceptions);
                if (!name.equals("onCreate") || !descriptor.equals("(Landroid/os/Bundle;)V")) return nextMethod;
                return new MethodVisitor(Opcodes.ASM9, nextMethod) {
                    @Override public void visitMethodInsn(int opcode, String owner, String method,
                            String descriptor, boolean isInterface) {
                        if (opcode == Opcodes.INVOKEVIRTUAL && owner.equals("android/view/Window")
                                && descriptor.equals("()I")
                                && (method.equals("getStatusBarColor") || method.equals("getNavigationBarColor"))) {
                            if (method.equals("getStatusBarColor")) statusReads++; else navigationReads++;
                            // SystemBarStyle.dark(Color.TRANSPARENT): keep light icons over the
                            // editor's black background, without consulting obsolete Window colors.
                            // Consume the Window receiver and leave the same int stack type.
                            super.visitInsn(Opcodes.POP);
                            super.visitInsn(Opcodes.ICONST_0);
                            return;
                        }
                        super.visitMethodInsn(opcode, owner, method, descriptor, isInterface);
                    }
                };
            }

            @Override public void visitEnd() {
                if (statusReads != 1 || navigationReads != 1) {
                    throw new IllegalStateException("ioncamera editor changed; review/remove CameraEdgeToEdgeFix before upgrading");
                }
                super.visitEnd();
            }
        };
    }
}
