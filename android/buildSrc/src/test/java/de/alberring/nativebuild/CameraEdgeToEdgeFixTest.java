package de.alberring.nativebuild;

import static org.junit.Assert.*;
import org.junit.Test;
import org.objectweb.asm.*;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.tree.analysis.*;

public class CameraEdgeToEdgeFixTest {
    private byte[] fixture(boolean includeNavigation) {
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        writer.visit(Opcodes.V17, Opcodes.ACC_PUBLIC, "Editor", null, "java/lang/Object", null);
        MethodVisitor method = writer.visitMethod(Opcodes.ACC_PUBLIC, "onCreate", "(Landroid/os/Bundle;)V", null, null);
        method.visitCode();
        for (String name : includeNavigation
                ? new String[]{"getStatusBarColor", "getNavigationBarColor", "getDecorView"}
                : new String[]{"getStatusBarColor", "getDecorView"}) {
            method.visitInsn(Opcodes.ACONST_NULL);
            method.visitMethodInsn(Opcodes.INVOKEVIRTUAL, "android/view/Window", name,
                name.equals("getDecorView") ? "()Landroid/view/View;" : "()I", false);
            method.visitInsn(Opcodes.POP);
        }
        method.visitInsn(Opcodes.RETURN);
        method.visitMaxs(0, 0);
        method.visitEnd();
        writer.visitEnd();
        return writer.toByteArray();
    }

    @Test public void removesOnlyObsoleteColorReadsAndPreservesValidStack() throws Exception {
        ClassWriter writer = new ClassWriter(0);
        new ClassReader(fixture(true)).accept(CameraEdgeToEdgeFix.patch(writer), 0);
        ClassNode output = new ClassNode();
        new ClassReader(writer.toByteArray()).accept(output, 0);
        MethodNode method = output.methods.get(0);
        new Analyzer<>(new BasicInterpreter()).analyze(output.name, method);
        int transparentColors = 0;
        int otherCalls = 0;
        for (AbstractInsnNode instruction : method.instructions) {
            if (instruction.getOpcode() == Opcodes.ICONST_0) transparentColors++;
            if (instruction instanceof MethodInsnNode call) {
                assertEquals("getDecorView", call.name);
                otherCalls++;
            }
        }
        assertEquals(2, transparentColors);
        assertEquals(1, otherCalls);
    }

    @Test(expected = IllegalStateException.class)
    public void refusesChangedUpstreamCode() {
        new ClassReader(fixture(false)).accept(CameraEdgeToEdgeFix.patch(new ClassWriter(0)), 0);
    }
}
